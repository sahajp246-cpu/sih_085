"""
FloodTwin Hydraulic & Hydrologic Simulation Engine

Couples 1D drainage hydraulics with 2D surface runoff for urban catchment modelling.
Provides nowcast propagation, What-If blockage impact analysis, and flood-aware routing.
"""

import math
import heapq
import uuid
from typing import Dict, List, Optional, Tuple
from models import (
    SimulationState, DrainageNode, DrainageEdge, RoadSegment,
    NowcastState, RainfallCell, CauseBreakdown, FloodAlert,
    RouteRequest, RouteResponse, RouteStep, WhatIfComparison,
    RiskLevel, NodeStatus, ConfidenceTier, AlertSeverity, DataMode, VehicleType
)


# Vehicle depth clearance thresholds in centimeters (roads exceeding depth are marked impassable)
VEHICLE_DEPTH_THRESHOLDS = {
    VehicleType.PEDESTRIAN: 15.0,
    VehicleType.CAR: 25.0,
    VehicleType.BUS: 40.0,
    VehicleType.AMBULANCE: 35.0,
}

# Baseline vehicle speeds (km/h) under clear weather conditions
VEHICLE_SPEEDS = {
    VehicleType.PEDESTRIAN: 5.0,
    VehicleType.CAR: 30.0,
    VehicleType.BUS: 25.0,
    VehicleType.AMBULANCE: 45.0,
}


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate great-circle distance between two geographic coordinates in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


class ScenarioEngine:
    """Hydraulic engine managing catchment topology, state propagation, and routing solvers."""

    def __init__(self):
        self.state = SimulationState(data_mode=DataMode.DEMO)
        self._node_map: Dict[str, DrainageNode] = {}
        self._edge_map: Dict[str, DrainageEdge] = {}
        self._road_map: Dict[str, RoadSegment] = {}
        self._road_graph: Dict[str, List[Tuple[str, float]]] = {}  # adjacency for routing
        self._init_chennai_catchment()

    def _init_chennai_catchment(self):
        """
        Synthetic but realistic Chennai pilot catchment around T. Nagar / Mambalam area.
        15 drainage nodes, 14 edges, 12 road segments.
        """
        # ── Drainage Nodes ──
        nodes_data = [
            # id, type, lat, lng, elev, rim, invert, capacity, tier
            ("J101", "inlet",    13.0382, 80.2340, 8.2, 8.2, 6.5, 120, "A"),
            ("J102", "inlet",    13.0390, 80.2355, 7.8, 7.8, 6.2, 110, "A"),
            ("J103", "manhole",  13.0398, 80.2348, 7.5, 7.5, 5.8, 150, "A"),
            ("J104", "junction", 13.0405, 80.2340, 7.0, 7.0, 5.2, 130, "A"),
            ("J105", "junction", 13.0412, 80.2355, 6.8, 6.8, 5.0, 140, "B"),
            ("J106", "manhole",  13.0420, 80.2342, 6.5, 6.5, 4.8, 160, "A"),
            ("J107", "inlet",    13.0375, 80.2365, 8.5, 8.5, 6.8, 100, "B"),
            ("J108", "junction", 13.0388, 80.2372, 7.6, 7.6, 5.9, 130, "B"),
            ("J109", "manhole",  13.0402, 80.2368, 7.2, 7.2, 5.5, 145, "A"),
            ("J110", "junction", 13.0415, 80.2375, 6.6, 6.6, 4.9, 155, "B"),
            ("J111", "inlet",    13.0425, 80.2360, 6.3, 6.3, 4.5, 170, "A"),
            ("J112", "storage",  13.0430, 80.2348, 6.0, 6.0, 4.0, 300, "A"),
            ("J113", "junction", 13.0435, 80.2365, 5.8, 5.8, 3.8, 200, "B"),
            ("J114", "manhole",  13.0440, 80.2355, 5.5, 5.5, 3.5, 250, "C"),
            ("J115", "outfall",  13.0448, 80.2345, 5.0, 5.0, 3.0, 500, "A"),
        ]

        self.state.nodes = []
        for nid, ntype, lat, lng, elev, rim, inv, cap, tier in nodes_data:
            node = DrainageNode(
                node_id=nid, node_type=ntype,
                lat=lat, lng=lng,
                elevation_m=elev, rim_elevation_m=rim, invert_elevation_m=inv,
                capacity_lps=cap,
                confidence_tier=ConfidenceTier(tier)
            )
            self.state.nodes.append(node)
            self._node_map[nid] = node

        # ── Drainage Edges (pipes/culverts) ──
        edges_data = [
            # id, type, src, tgt, len, dia, slope, rough, cap, tier
            ("P01", "pipe",    "J101", "J103", 85,  600, 0.4, 0.013, 120, "A"),
            ("P02", "pipe",    "J102", "J103", 70,  500, 0.5, 0.013, 110, "A"),
            ("P03", "pipe",    "J103", "J104", 90,  750, 0.3, 0.013, 150, "A"),
            ("P04", "pipe",    "J104", "J106", 80,  600, 0.4, 0.013, 130, "A"),
            ("P05", "pipe",    "J105", "J106", 75,  700, 0.35, 0.013, 140, "B"),
            ("P06", "pipe",    "J106", "J112", 65,  900, 0.3, 0.013, 200, "A"),
            ("P07", "pipe",    "J107", "J108", 95,  500, 0.5, 0.013, 100, "B"),
            ("P08", "pipe",    "J108", "J109", 80,  600, 0.4, 0.013, 130, "B"),
            ("P09", "pipe",    "J109", "J110", 70,  700, 0.35, 0.013, 145, "A"),
            ("P10", "pipe",    "J110", "J113", 85,  800, 0.3, 0.013, 155, "B"),
            ("P11", "culvert", "J105", "J110", 90,  500, 0.25, 0.015, 100, "B"),
            ("P12", "pipe",    "J111", "J112", 60,  800, 0.35, 0.013, 170, "A"),
            ("P13", "pipe",    "J112", "J114", 75,  1000, 0.3, 0.013, 250, "A"),
            ("P14", "pipe",    "J113", "J114", 65,  900, 0.3, 0.013, 200, "B"),
            ("E15", "pipe",    "J114", "J115", 90,  1200, 0.25, 0.013, 350, "A"),
        ]

        self.state.edges = []
        for eid, etype, src, tgt, length, dia, slope, rough, cap, tier in edges_data:
            edge = DrainageEdge(
                edge_id=eid, edge_type=etype,
                source_node=src, target_node=tgt,
                length_m=length, diameter_mm=dia,
                slope_pct=slope, roughness_n=rough,
                capacity_lps=cap,
                confidence_tier=ConfidenceTier(tier)
            )
            self.state.edges.append(edge)
            self._edge_map[eid] = edge

        # ── Road Segments ──
        roads_data = [
            ("R01", "Thyagaraya Rd - Seg A",
             [[80.2340, 13.0382], [80.2348, 13.0398]], "J101", 8.2, 80),
            ("R02", "Thyagaraya Rd - Seg B",
             [[80.2348, 13.0398], [80.2340, 13.0405]], "J103", 7.5, 85),
            ("R03", "Panagal Park Rd",
             [[80.2355, 13.0390], [80.2348, 13.0398]], "J102", 7.8, 75),
            ("R04", "Usman Rd - Seg A",
             [[80.2340, 13.0405], [80.2342, 13.0420]], "J104", 7.0, 90),
            ("R05", "Usman Rd - Seg B",
             [[80.2342, 13.0420], [80.2348, 13.0430]], "J106", 6.5, 85),
            ("R06", "Bazullah Rd",
             [[80.2355, 13.0405], [80.2355, 13.0412]], "J105", 6.8, 70),
            ("R07", "South Mada St",
             [[80.2365, 13.0375], [80.2372, 13.0388]], "J107", 8.5, 65),
            ("R08", "Habibullah Rd",
             [[80.2372, 13.0388], [80.2368, 13.0402]], "J108", 7.6, 80),
            ("R09", "North Usman Rd",
             [[80.2368, 13.0402], [80.2375, 13.0415]], "J109", 7.2, 85),
            ("R10", "GN Chetty Rd",
             [[80.2375, 13.0415], [80.2360, 13.0425]], "J110", 6.6, 75),
            ("R11", "Natesan St",
             [[80.2360, 13.0425], [80.2348, 13.0430]], "J111", 6.3, 70),
            ("R12", "Canal Bank Rd",
             [[80.2348, 13.0430], [80.2345, 13.0448]], "J112", 6.0, 60),
        ]

        self.state.roads = []
        for sid, name, path, assoc_node, elev, imperv in roads_data:
            road = RoadSegment(
                segment_id=sid, name=name, path=path,
                associated_node_id=assoc_node,
                elevation_m=elev,
                imperviousness_pct=imperv,
            )
            self.state.roads.append(road)
            self._road_map[sid] = road

        # Build road adjacency graph for routing
        self._build_road_graph()

    def _build_road_graph(self):
        """Build adjacency from road endpoints for Dijkstra routing."""
        self._road_graph = {}
        for road in self.state.roads:
            start = tuple(road.path[0])
            end = tuple(road.path[-1])
            dist = _haversine(start[1], start[0], end[1], end[0])
            self._road_graph.setdefault(start, []).append((end, dist, road.segment_id))
            self._road_graph.setdefault(end, []).append((start, dist, road.segment_id))

    # ── Rainfall Nowcasting (DEMO) ─────────────────────────

    def _compute_rainfall(self, scenario: str, time_min: int) -> NowcastState:
        """
        Deterministic demo rainfall nowcast.
        Produces a realistic storm curve, not random noise.
        """
        # Storm intensity profiles (mm/h over 180 min in 5-min steps)
        if scenario == "baseline":
            base = 0.0
            peak = 0.0
        elif scenario == "moderate_rain":
            base = 8.0
            peak = 35.0
        elif scenario == "heavy_rain":
            base = 15.0
            peak = 75.0
        elif scenario == "extreme_rain":
            base = 25.0
            peak = 130.0
        else:
            base = 0.0
            peak = 0.0

        # Bell-curve storm: peak at ~60 min
        sigma = 40.0
        mu = 60.0
        if peak > 0:
            current = base + (peak - base) * math.exp(-0.5 * ((time_min - mu) / sigma) ** 2)
        else:
            current = 0.0

        # Build 36-step forecast timeline (0–180 min, every 5 min)
        timeline = []
        for t in range(0, 181, 5):
            if peak > 0:
                val = base + (peak - base) * math.exp(-0.5 * ((t - mu) / sigma) ** 2)
            else:
                val = 0.0
            timeline.append(round(val, 1))

        # Cumulative rainfall up to current time
        cumulative = 0.0
        for t in range(0, time_min + 1, 5):
            if peak > 0:
                val = base + (peak - base) * math.exp(-0.5 * ((t - mu) / sigma) ** 2)
                cumulative += val * (5.0 / 60.0)  # mm in 5 min

        # Uncertainty — wider at higher lead times
        spread = max(0.15, 0.05 * (time_min / 30.0))
        forecast_30 = base + (peak - base) * math.exp(-0.5 * (((time_min + 30) - mu) / sigma) ** 2) if peak > 0 else 0

        # Rainfall cells (3x3 grid over catchment)
        cells = []
        for lat_off in [-0.003, 0, 0.003]:
            for lng_off in [-0.003, 0, 0.003]:
                spatial_var = 1.0 + 0.1 * math.sin(lat_off * 1000) * math.cos(lng_off * 1000)
                cells.append(RainfallCell(
                    lat=13.041 + lat_off,
                    lng=80.235 + lng_off,
                    intensity_mm_h=round(current * spatial_var, 1),
                    intensity_lower_mm_h=round(current * spatial_var * (1 - spread), 1),
                    intensity_upper_mm_h=round(current * spatial_var * (1 + spread), 1),
                    cumulative_mm=round(cumulative * spatial_var, 1),
                ))

        prob_heavy = min(95, max(0, (current / 30.0) * 100)) if current > 10 else 0
        prob_extreme = min(95, max(0, ((current - 30) / 60.0) * 100)) if current > 30 else 0

        return NowcastState(
            current_intensity_mm_h=round(current, 1),
            forecast_intensity_mm_h=round(forecast_30, 1),
            peak_intensity_mm_h=round(peak, 1),
            cumulative_mm=round(cumulative, 1),
            probability_heavy=round(prob_heavy, 1),
            probability_extreme=round(prob_extreme, 1),
            lead_time_min=time_min,
            confidence_pct=round(max(40, 95 - time_min * 0.3), 1),
            data_mode=DataMode.DEMO,
            method="Optical-flow extrapolation + ML refinement (DEMO)",
            cells=cells,
            forecast_timeline=timeline,
        )

    # ── Hydraulic Simulation (DEMO) ────────────────────────

    def _run_hydraulics(self, rainfall_mm_h: float, time_min: int, blockages: Dict[str, float]):
        """
        Deterministic demo hydraulic solver.
        NOT EPA SWMM — clearly a simplified engineering demo.
        Models: rainfall → runoff → inlet capture → pipe flow → surcharge → surface backflow.
        """
        temporal_factor = min(time_min / 90.0, 1.0)
        runoff_coeff = 0.85  # urban

        # Phase 1: compute inflow at each inlet from rainfall
        for node in self.state.nodes:
            catchment_area_ha = 0.5  # assume 0.5 hectare per inlet
            # Rational method: Q = C * I * A (simplified, converted to lps)
            inflow_lps = runoff_coeff * (rainfall_mm_h / 3600.0) * (catchment_area_ha * 10000) * temporal_factor

            # Apply blockage
            blockage = blockages.get(node.node_id, 0.0) / 100.0
            effective_capacity = node.capacity_lps * (1.0 - blockage)
            node.blockage_pct = blockages.get(node.node_id, 0.0)

            node.current_flow_lps = round(inflow_lps, 1)
            node.utilisation_pct = round((inflow_lps / max(effective_capacity, 1)) * 100, 1) if effective_capacity > 0 else 200.0

        # Phase 2: propagate flow downstream through edges
        # Topological order by elevation (high→low)
        sorted_nodes = sorted(self.state.nodes, key=lambda n: -n.elevation_m)

        # Build downstream map
        downstream = {}
        for edge in self.state.edges:
            downstream.setdefault(edge.source_node, []).append(edge)

        for node in sorted_nodes:
            out_edges = downstream.get(node.node_id, [])
            if not out_edges:
                continue

            excess = max(0, node.current_flow_lps - node.capacity_lps * (1 - node.blockage_pct / 100))

            for edge in out_edges:
                blockage = blockages.get(edge.source_node, 0.0) / 100.0
                eff_cap = edge.capacity_lps * (1 - blockage * 0.5)
                pipe_flow = min(node.current_flow_lps / len(out_edges), eff_cap)
                edge.current_flow_lps = round(pipe_flow, 1)
                edge.utilisation_pct = round((pipe_flow / max(eff_cap, 1)) * 100, 1)
                edge.velocity_mps = round(pipe_flow / (math.pi * (edge.diameter_mm / 2000) ** 2 * 1000), 2) if edge.diameter_mm > 0 else 0

                if edge.utilisation_pct > 100:
                    edge.status = NodeStatus.SURCHARGE
                elif edge.utilisation_pct > 80:
                    edge.status = NodeStatus.WARNING
                else:
                    edge.status = NodeStatus.NORMAL

                # Add flow to downstream node
                tgt = self._node_map.get(edge.target_node)
                if tgt:
                    tgt.current_flow_lps = round(tgt.current_flow_lps + pipe_flow, 1)
                    blockage_tgt = blockages.get(tgt.node_id, 0.0) / 100.0
                    eff_cap_tgt = tgt.capacity_lps * (1 - blockage_tgt)
                    tgt.utilisation_pct = round((tgt.current_flow_lps / max(eff_cap_tgt, 1)) * 100, 1) if eff_cap_tgt > 0 else 200.0

        # Phase 3: determine node status, surcharge, surface exchange
        for node in self.state.nodes:
            blockage = blockages.get(node.node_id, 0.0) / 100.0
            eff_cap = node.capacity_lps * (1 - blockage)

            if node.utilisation_pct > 120:
                node.status = NodeStatus.SURCHARGE
                node.hydraulic_head_m = node.invert_elevation_m + (node.utilisation_pct - 100) * 0.02
                overflow = node.current_flow_lps - eff_cap
                node.surface_exchange_lps = round(-overflow, 1)  # negative = water to surface
                node.depth_m = round((node.utilisation_pct - 100) * 0.015, 2)
                node.cause = f"Capacity exceeded ({node.utilisation_pct:.0f}%)" + (f" — {node.blockage_pct:.0f}% blocked" if node.blockage_pct > 0 else "")
            elif node.utilisation_pct > 100:
                node.status = NodeStatus.BACKFLOW
                node.hydraulic_head_m = node.invert_elevation_m + 0.5
                node.surface_exchange_lps = round(-(node.current_flow_lps - eff_cap) * 0.5, 1)
                node.depth_m = round((node.utilisation_pct - 100) * 0.008, 2)
                node.cause = "Approaching surcharge"
            elif node.utilisation_pct > 75:
                node.status = NodeStatus.WARNING
                node.hydraulic_head_m = node.invert_elevation_m + 0.2
                node.surface_exchange_lps = round(node.current_flow_lps * 0.3, 1)
                node.depth_m = 0.0
                node.cause = "High incoming flow"
            else:
                node.status = NodeStatus.NORMAL
                node.hydraulic_head_m = node.invert_elevation_m
                node.surface_exchange_lps = round(node.current_flow_lps * 0.8, 1)
                node.depth_m = 0.0
                node.cause = None

            # Time to critical
            if node.utilisation_pct >= 100:
                node.time_to_critical_min = 0
            elif node.utilisation_pct > 50 and rainfall_mm_h > 10:
                remaining = 100 - node.utilisation_pct
                rate = max(node.utilisation_pct / max(time_min, 5), 0.5)
                node.time_to_critical_min = max(1, int(remaining / rate))
            else:
                node.time_to_critical_min = None

        # Count downstream impact for each node
        for node in self.state.nodes:
            count = 0
            visited = set()
            queue = [node.node_id]
            while queue:
                curr = queue.pop(0)
                if curr in visited:
                    continue
                visited.add(curr)
                for edge in self.state.edges:
                    if edge.source_node == curr and edge.target_node not in visited:
                        queue.append(edge.target_node)
                        count += 1
            node.downstream_impact_count = count

    # ── Surface-Drainage Coupling ──────────────────────────

    def _couple_surface_drainage(self, rainfall_mm_h: float, time_min: int):
        """
        2D surface ↔ 1D drainage coupling at each road/node pair.
        Water flows to drains normally; surcharge pushes water back to surface.
        """
        temporal_factor = min(time_min / 90.0, 1.0)

        for road in self.state.roads:
            node = self._node_map.get(road.associated_node_id)
            if not node:
                continue

            # Surface runoff from rainfall
            surface_runoff_cm = (rainfall_mm_h / 100.0) * (road.imperviousness_pct / 100.0) * temporal_factor * 8.0

            # Drainage contribution (surcharge → surface backflow)
            drainage_backflow_cm = 0.0
            if node.surface_exchange_lps < 0:
                # Water returning to surface from overwhelmed drainage
                drainage_backflow_cm = abs(node.surface_exchange_lps) * 0.15 * temporal_factor

            # Terrain ponding (low elevation = more ponding)
            terrain_factor = max(0, (9.0 - road.elevation_m) / 3.0)
            terrain_ponding_cm = surface_runoff_cm * terrain_factor * 0.3

            total_depth = surface_runoff_cm + drainage_backflow_cm + terrain_ponding_cm
            road.depth_cm = round(total_depth, 1)

            # Uncertainty bounds
            spread = 0.2 + 0.1 * (time_min / 60.0)
            road.depth_lower_cm = round(total_depth * (1 - spread), 1)
            road.depth_upper_cm = round(total_depth * (1 + spread), 1)

            # Velocity estimate
            slope = max(0.001, (road.elevation_m - 5.0) / 500.0)
            road.velocity_mps = round(math.sqrt(slope) * min(total_depth / 100.0, 0.5) * 3.0, 2) if total_depth > 5 else 0.0

            # Drainage utilisation from associated node
            road.drainage_utilisation_pct = round(node.utilisation_pct, 1)

            # Cause breakdown
            total_cause = max(surface_runoff_cm + drainage_backflow_cm + terrain_ponding_cm, 0.01)
            road.cause_breakdown = CauseBreakdown(
                rainfall_pct=round(surface_runoff_cm / total_cause * 100, 1),
                terrain_pct=round(terrain_ponding_cm / total_cause * 100, 1),
                drainage_constraint_pct=round(drainage_backflow_cm / total_cause * 100, 1),
                imperviousness_pct=round(road.imperviousness_pct * 0.3, 1),
                blockage_pct=round(node.blockage_pct * 0.5, 1),
            )

            # Cause summary
            causes = []
            if drainage_backflow_cm > surface_runoff_cm * 0.5:
                causes.append("Drainage constraint (surcharge/backflow)")
            if surface_runoff_cm > 5:
                causes.append("High rainfall intensity")
            if terrain_ponding_cm > 3:
                causes.append("Low-lying terrain")
            if node.blockage_pct > 20:
                causes.append(f"Blockage at {node.node_id} ({node.blockage_pct:.0f}%)")
            road.cause_summary = "; ".join(causes) if causes else None

            # Risk level
            if total_depth > 30:
                road.risk_level = RiskLevel.CRITICAL
            elif total_depth > 20:
                road.risk_level = RiskLevel.HIGH
            elif total_depth > 10:
                road.risk_level = RiskLevel.CAUTION
            else:
                road.risk_level = RiskLevel.SAFE

            # Exceedance probabilities (based on deterministic + spread)
            for threshold, attr in [(10, 'probability_10cm'), (20, 'probability_20cm'),
                                     (30, 'probability_30cm'), (50, 'probability_50cm')]:
                if total_depth <= 0:
                    setattr(road, attr, 0.0)
                else:
                    z = (total_depth - threshold) / max(total_depth * spread, 1)
                    prob = min(98, max(1, 50 + z * 30))
                    setattr(road, attr, round(prob, 1))

            # Time to flood (>15cm)
            if total_depth >= 15:
                road.time_to_flood_min = 0
            elif rainfall_mm_h > 10 and total_depth > 3:
                rate = total_depth / max(time_min, 5)
                remaining = 15 - total_depth
                road.time_to_flood_min = max(1, int(remaining / max(rate, 0.1)))
            else:
                road.time_to_flood_min = None

    # ── Alerts ─────────────────────────────────────────────

    def _generate_alerts(self, time_min: int) -> List[FloodAlert]:
        alerts = []
        aid = 0

        for node in self.state.nodes:
            if node.status in (NodeStatus.SURCHARGE, NodeStatus.BACKFLOW):
                aid += 1
                alerts.append(FloodAlert(
                    alert_id=f"ALT-{aid:03d}",
                    severity=AlertSeverity.CRITICAL if node.status == NodeStatus.SURCHARGE else AlertSeverity.WARNING,
                    title=f"{'CRITICAL' if node.status == NodeStatus.SURCHARGE else 'WARNING'}: Node {node.node_id}",
                    message=f"{node.node_id} ({node.node_type}) at {node.utilisation_pct:.0f}% utilisation. {node.cause or ''}",
                    timestamp_min=time_min,
                    related_node_id=node.node_id,
                ))

        for road in self.state.roads:
            if road.risk_level in (RiskLevel.CRITICAL, RiskLevel.HIGH):
                aid += 1
                ttf = f" in {road.time_to_flood_min} min" if road.time_to_flood_min and road.time_to_flood_min > 0 else " NOW"
                alerts.append(FloodAlert(
                    alert_id=f"ALT-{aid:03d}",
                    severity=AlertSeverity.CRITICAL if road.risk_level == RiskLevel.CRITICAL else AlertSeverity.WARNING,
                    title=f"FLOOD {'WARNING' if road.risk_level == RiskLevel.HIGH else 'ALERT'}: {road.name}",
                    message=f"Predicted depth {road.depth_cm:.0f} cm{ttf}. {road.cause_summary or ''}",
                    timestamp_min=time_min,
                    related_segment_id=road.segment_id,
                ))

        return alerts[:20]  # cap

    # ── Critical Nodes ─────────────────────────────────────

    def _rank_critical_nodes(self) -> List[str]:
        return [
            n.node_id for n in sorted(
                self.state.nodes,
                key=lambda n: (-n.utilisation_pct, -n.downstream_impact_count)
            )
            if n.utilisation_pct > 60
        ]

    # ── Main Simulation Step ───────────────────────────────

    def run_step(self, scenario: str, time_min: int, blockages: Optional[Dict[str, float]] = None) -> SimulationState:
        if blockages is None:
            blockages = {}

        # Reset flows
        for node in self.state.nodes:
            node.current_flow_lps = 0.0
        for edge in self.state.edges:
            edge.current_flow_lps = 0.0

        # 1. Rainfall nowcast
        nowcast = self._compute_rainfall(scenario, time_min)
        self.state.nowcast = nowcast
        self.state.scenario = scenario
        self.state.time_min = time_min

        # 2. Hydraulic simulation
        self._run_hydraulics(nowcast.current_intensity_mm_h, time_min, blockages)

        # 3. Surface-drainage coupling
        self._couple_surface_drainage(nowcast.current_intensity_mm_h, time_min)

        # 4. Alerts
        self.state.alerts = self._generate_alerts(time_min)

        # 5. Critical nodes
        self.state.critical_nodes = self._rank_critical_nodes()

        return self.state

    # ── What-If ────────────────────────────────────────────

    def run_whatif(self, node_id: str, blockage_pct: float) -> WhatIfComparison:
        """Run before/after comparison for a blockage scenario."""
        current_scenario = self.state.scenario
        current_time = self.state.time_min

        # Before state (current)
        before_roads = {r.segment_id: (r.depth_cm, r.risk_level, r.time_to_flood_min) for r in self.state.roads}
        before_node = None
        for n in self.state.nodes:
            if n.node_id == node_id:
                before_node = (n.utilisation_pct, n.status)
                break

        # Run with blockage
        blockages = {node_id: blockage_pct}
        self.run_step(current_scenario, current_time, blockages)

        # After state
        after_node = None
        for n in self.state.nodes:
            if n.node_id == node_id:
                after_node = n
                break

        # Find most affected road
        affected_roads = []
        affected_nodes = [node_id]
        primary_road_before = (0, RiskLevel.SAFE, None)
        primary_road_after = (0, RiskLevel.SAFE, None)

        for road in self.state.roads:
            if road.associated_node_id == node_id:
                primary_road_after = (road.depth_cm, road.risk_level, road.time_to_flood_min)
                prev = before_roads.get(road.segment_id, (0, RiskLevel.SAFE, None))
                primary_road_before = prev

            prev = before_roads.get(road.segment_id, (0, RiskLevel.SAFE, None))
            if road.depth_cm > prev[0] + 2:
                affected_roads.append(road.segment_id)

        # Downstream affected nodes
        for n in self.state.nodes:
            if n.node_id != node_id and n.utilisation_pct > 80:
                affected_nodes.append(n.node_id)

        return WhatIfComparison(
            node_id=node_id,
            blockage_pct=blockage_pct,
            before_depth_cm=round(primary_road_before[0], 1),
            after_depth_cm=round(primary_road_after[0], 1),
            before_utilisation_pct=round(before_node[0] if before_node else 0, 1),
            after_utilisation_pct=round(after_node.utilisation_pct if after_node else 0, 1),
            before_risk=primary_road_before[1] if isinstance(primary_road_before[1], RiskLevel) else RiskLevel.SAFE,
            after_risk=primary_road_after[1] if isinstance(primary_road_after[1], RiskLevel) else RiskLevel.SAFE,
            before_time_to_flood_min=primary_road_before[2] if len(primary_road_before) > 2 else None,
            after_time_to_flood_min=primary_road_after[2] if len(primary_road_after) > 2 else None,
            additional_affected_roads=affected_roads,
            affected_nodes=affected_nodes,
        )

    # ── Flood-Safe Routing (Dijkstra) ──────────────────────

    def compute_route(self, req: RouteRequest) -> RouteResponse:
        """
        Dijkstra shortest path with flood-risk penalty.
        Unsafe roads are excluded based on vehicle depth threshold.
        """
        threshold = VEHICLE_DEPTH_THRESHOLDS.get(req.vehicle_type, 25)
        speed = VEHICLE_SPEEDS.get(req.vehicle_type, 30)

        # Find nearest graph nodes to origin/dest
        origin = self._nearest_graph_node(req.origin_lat, req.origin_lng)
        dest = self._nearest_graph_node(req.dest_lat, req.dest_lng)

        if origin is None or dest is None:
            return RouteResponse(
                route_id=str(uuid.uuid4())[:8],
                vehicle_type=req.vehicle_type,
                is_safe=False,
                flood_risk=RiskLevel.CRITICAL,
            )

        # Build cost graph with flood penalties
        road_depths = {r.segment_id: r.depth_cm for r in self.state.roads}
        road_risks = {r.segment_id: r.risk_level for r in self.state.roads}
        avoided = []
        avoid_reasons = []

        # Dijkstra
        dist = {origin: 0.0}
        prev = {}
        prev_seg = {}
        pq = [(0.0, origin)]
        visited = set()

        while pq:
            d, u = heapq.heappop(pq)
            if u in visited:
                continue
            visited.add(u)
            if u == dest:
                break

            for (v, base_dist, seg_id) in self._road_graph.get(u, []):
                if v in visited:
                    continue

                depth = road_depths.get(seg_id, 0)

                # Exclude unsafe roads for this vehicle
                if depth > threshold:
                    if seg_id not in avoided:
                        avoided.append(seg_id)
                        road = self._road_map.get(seg_id)
                        name = road.name if road else seg_id
                        avoid_reasons.append(f"{name}: {depth:.0f}cm depth exceeds {threshold}cm limit for {req.vehicle_type.value}")
                    continue

                # Flood penalty
                penalty = 1.0
                if depth > threshold * 0.5:
                    penalty = 2.0
                elif depth > threshold * 0.3:
                    penalty = 1.3

                cost = base_dist * penalty
                new_dist = d + cost

                if new_dist < dist.get(v, float('inf')):
                    dist[v] = new_dist
                    prev[v] = u
                    prev_seg[v] = seg_id
                    heapq.heappush(pq, (new_dist, v))

        # Reconstruct path
        if dest not in prev and origin != dest:
            return RouteResponse(
                route_id=str(uuid.uuid4())[:8],
                vehicle_type=req.vehicle_type,
                is_safe=False,
                flood_risk=RiskLevel.CRITICAL,
                avoided_segments=avoided,
                avoid_reasons=avoid_reasons,
            )

        path_nodes = []
        curr = dest
        total_dist = 0.0
        max_risk = RiskLevel.SAFE
        while curr is not None:
            seg_id = prev_seg.get(curr)
            risk = road_risks.get(seg_id, RiskLevel.SAFE) if seg_id else RiskLevel.SAFE
            path_nodes.append(RouteStep(lat=curr[1], lng=curr[0], road_segment_id=seg_id, risk_level=risk))
            if risk == RiskLevel.CRITICAL or max_risk == RiskLevel.CRITICAL:
                max_risk = RiskLevel.CRITICAL
            elif risk == RiskLevel.HIGH or max_risk == RiskLevel.HIGH:
                max_risk = RiskLevel.HIGH
            elif risk == RiskLevel.CAUTION or max_risk == RiskLevel.CAUTION:
                max_risk = RiskLevel.CAUTION
            p = prev.get(curr)
            if p:
                total_dist += _haversine(curr[1], curr[0], p[1], p[0])
            curr = p

        path_nodes.reverse()
        eta = (total_dist / speed) * 60 if speed > 0 else 0

        return RouteResponse(
            route_id=str(uuid.uuid4())[:8],
            vehicle_type=req.vehicle_type,
            path=path_nodes,
            distance_km=round(total_dist, 2),
            eta_min=round(eta, 1),
            flood_risk=max_risk,
            avoided_segments=avoided,
            avoid_reasons=avoid_reasons,
            safety_score=round(max(0, 100 - len(avoided) * 15 - (10 if max_risk != RiskLevel.SAFE else 0)), 1),
            is_safe=max_risk in (RiskLevel.SAFE, RiskLevel.CAUTION),
        )

    def _nearest_graph_node(self, lat: float, lng: float) -> Optional[tuple]:
        best = None
        best_dist = float('inf')
        for node in self._road_graph:
            d = _haversine(lat, node[1], lng, node[0])
            if d < best_dist:
                best_dist = d
                best = node
        return best

    # ── Accessors ──────────────────────────────────────────

    def get_node(self, node_id: str) -> Optional[DrainageNode]:
        return self._node_map.get(node_id)

    def get_segment(self, seg_id: str) -> Optional[RoadSegment]:
        return self._road_map.get(seg_id)
