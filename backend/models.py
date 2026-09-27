"""
FloodTwin — Pydantic Models
SIH26085 — Urban Flood Nowcasting System (Drainage and Rainfall Coupling)
All simulation state, API request/response models.
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from enum import Enum


# ── Enums ──────────────────────────────────────────────────

class RiskLevel(str, Enum):
    SAFE = "SAFE"
    CAUTION = "CAUTION"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class NodeStatus(str, Enum):
    NORMAL = "NORMAL"
    WARNING = "WARNING"
    SURCHARGE = "SURCHARGE"
    BACKFLOW = "BACKFLOW"


class ConfidenceTier(str, Enum):
    A = "A"  # Verified municipal data
    B = "B"  # GIS/engineering-derived
    C = "C"  # Estimated/synthetic


class VehicleType(str, Enum):
    PEDESTRIAN = "pedestrian"
    CAR = "car"
    BUS = "bus"
    AMBULANCE = "ambulance"


class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class DataMode(str, Enum):
    LIVE = "LIVE"
    DEMO = "DEMO"
    UNAVAILABLE = "UNAVAILABLE"


# ── Drainage Graph ─────────────────────────────────────────

class DrainageNode(BaseModel):
    node_id: str
    node_type: str  # inlet, junction, manhole, outfall, storage
    lat: float
    lng: float
    elevation_m: float = 0.0
    rim_elevation_m: float = 0.0
    invert_elevation_m: float = 0.0
    capacity_lps: float = 100.0  # litres per second
    current_flow_lps: float = 0.0
    utilisation_pct: float = 0.0
    hydraulic_head_m: float = 0.0
    depth_m: float = 0.0
    surface_exchange_lps: float = 0.0  # +ve = surface→drain, -ve = drain→surface (surcharge)
    time_to_critical_min: Optional[int] = None
    status: NodeStatus = NodeStatus.NORMAL
    cause: Optional[str] = None
    confidence_tier: ConfidenceTier = ConfidenceTier.A
    blockage_pct: float = 0.0
    downstream_impact_count: int = 0


class DrainageEdge(BaseModel):
    edge_id: str
    edge_type: str = "pipe"  # pipe, culvert, open_channel, pumped
    source_node: str
    target_node: str
    length_m: float = 50.0
    diameter_mm: float = 600.0
    slope_pct: float = 0.5
    roughness_n: float = 0.013  # Manning's n
    capacity_lps: float = 100.0
    current_flow_lps: float = 0.0
    utilisation_pct: float = 0.0
    velocity_mps: float = 0.0
    status: NodeStatus = NodeStatus.NORMAL
    confidence_tier: ConfidenceTier = ConfidenceTier.A


# ── Roads ──────────────────────────────────────────────────

class CauseBreakdown(BaseModel):
    rainfall_pct: float = 0.0
    terrain_pct: float = 0.0
    drainage_constraint_pct: float = 0.0
    imperviousness_pct: float = 0.0
    blockage_pct: float = 0.0


class RoadSegment(BaseModel):
    segment_id: str
    name: str
    path: List[List[float]]  # [[lng, lat], ...]
    depth_cm: float = 0.0
    depth_lower_cm: float = 0.0
    depth_upper_cm: float = 0.0
    velocity_mps: float = 0.0
    probability_10cm: float = 0.0
    probability_20cm: float = 0.0
    probability_30cm: float = 0.0
    probability_50cm: float = 0.0
    time_to_flood_min: Optional[int] = None
    drainage_utilisation_pct: float = 0.0
    cause_summary: Optional[str] = None
    cause_breakdown: CauseBreakdown = CauseBreakdown()
    risk_level: RiskLevel = RiskLevel.SAFE
    confidence_tier: ConfidenceTier = ConfidenceTier.B
    associated_node_id: Optional[str] = None
    elevation_m: float = 0.0
    imperviousness_pct: float = 70.0


# ── Rainfall / Nowcast ─────────────────────────────────────

class RainfallCell(BaseModel):
    lat: float
    lng: float
    intensity_mm_h: float = 0.0
    intensity_lower_mm_h: float = 0.0
    intensity_upper_mm_h: float = 0.0
    cumulative_mm: float = 0.0


class NowcastState(BaseModel):
    current_intensity_mm_h: float = 0.0
    forecast_intensity_mm_h: float = 0.0
    peak_intensity_mm_h: float = 0.0
    cumulative_mm: float = 0.0
    probability_heavy: float = 0.0  # P(>30mm/h)
    probability_extreme: float = 0.0  # P(>60mm/h)
    lead_time_min: int = 0
    confidence_pct: float = 0.0
    data_mode: DataMode = DataMode.DEMO
    method: str = "Optical-flow extrapolation + ML refinement (DEMO)"
    cells: List[RainfallCell] = []
    forecast_timeline: List[float] = []  # mm/h at each 5-min step


# ── Routing ────────────────────────────────────────────────

class RouteRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    vehicle_type: VehicleType = VehicleType.CAR

    @field_validator('origin_lat', 'dest_lat')
    @classmethod
    def validate_lat(cls, v):
        if not -90 <= v <= 90:
            raise ValueError('Latitude must be between -90 and 90')
        return v

    @field_validator('origin_lng', 'dest_lng')
    @classmethod
    def validate_lng(cls, v):
        if not -180 <= v <= 180:
            raise ValueError('Longitude must be between -180 and 180')
        return v


class RouteStep(BaseModel):
    lat: float
    lng: float
    road_segment_id: Optional[str] = None
    risk_level: RiskLevel = RiskLevel.SAFE


class RouteResponse(BaseModel):
    route_id: str
    vehicle_type: VehicleType
    path: List[RouteStep] = []
    distance_km: float = 0.0
    eta_min: float = 0.0
    flood_risk: RiskLevel = RiskLevel.SAFE
    avoided_segments: List[str] = []
    avoid_reasons: List[str] = []
    safety_score: float = 100.0
    is_safe: bool = True


# ── What-If ────────────────────────────────────────────────

class WhatIfRequest(BaseModel):
    node_id: str
    blockage_pct: float = Field(ge=0, le=100)

    @field_validator('blockage_pct')
    @classmethod
    def validate_blockage(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('Blockage must be between 0 and 100')
        return v


class WhatIfComparison(BaseModel):
    node_id: str
    blockage_pct: float
    before_depth_cm: float
    after_depth_cm: float
    before_utilisation_pct: float
    after_utilisation_pct: float
    before_risk: RiskLevel
    after_risk: RiskLevel
    before_time_to_flood_min: Optional[int]
    after_time_to_flood_min: Optional[int]
    additional_affected_roads: List[str] = []
    affected_nodes: List[str] = []


# ── Alerts ─────────────────────────────────────────────────

class FloodAlert(BaseModel):
    alert_id: str
    severity: AlertSeverity
    title: str
    message: str
    timestamp_min: int = 0
    related_node_id: Optional[str] = None
    related_segment_id: Optional[str] = None
    is_active: bool = True


# ── Complete Simulation State ──────────────────────────────

class SimulationState(BaseModel):
    scenario: str = "baseline"
    time_min: int = 0
    data_mode: DataMode = DataMode.DEMO
    nodes: List[DrainageNode] = []
    edges: List[DrainageEdge] = []
    roads: List[RoadSegment] = []
    nowcast: NowcastState = NowcastState()
    alerts: List[FloodAlert] = []
    critical_nodes: List[str] = []  # sorted by severity


class HealthResponse(BaseModel):
    status: str = "healthy"
    data_mode: DataMode = DataMode.DEMO
    version: str = "1.0.0"
    components: dict = {}
