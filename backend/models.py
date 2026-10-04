"""
FloodTwin Backend Domain Models

Pydantic schemas for simulation state, drainage networks, rainfall nowcasting,
what-if scenario evaluations, and flood-aware routing requests.
"""

from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


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
    A = "A"  # Verified municipal / sensor data
    B = "B"  # GIS / elevation model derived
    C = "C"  # Estimated / synthetic baseline


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


class DrainageNode(BaseModel):
    node_id: str
    node_type: str  # inlet, junction, manhole, outfall, storage
    lat: float
    lng: float
    elevation_m: float = 0.0
    rim_elevation_m: float = 0.0
    invert_elevation_m: float = 0.0
    capacity_lps: float = 100.0
    current_flow_lps: float = 0.0
    utilisation_pct: float = 0.0
    hydraulic_head_m: float = 0.0
    depth_m: float = 0.0
    surface_exchange_lps: float = 0.0
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
    roughness_n: float = 0.013  # Manning's roughness
    capacity_lps: float = 100.0
    current_flow_lps: float = 0.0
    utilisation_pct: float = 0.0
    velocity_mps: float = 0.0
    status: NodeStatus = NodeStatus.NORMAL
    confidence_tier: ConfidenceTier = ConfidenceTier.A


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
    probability_heavy: float = 0.0
    probability_extreme: float = 0.0
    lead_time_min: int = 0
    confidence_pct: float = 0.0
    data_mode: DataMode = DataMode.DEMO
    method: str = "Optical-flow extrapolation with ML refinement"
    cells: List[RainfallCell] = []
    forecast_timeline: List[float] = []


class RouteRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    vehicle_type: VehicleType = VehicleType.CAR

    @field_validator("origin_lat", "dest_lat")
    @classmethod
    def validate_latitude(cls, value: float) -> float:
        if not -90.0 <= value <= 90.0:
            raise ValueError("Latitude must be between -90 and 90 degrees")
        return value

    @field_validator("origin_lng", "dest_lng")
    @classmethod
    def validate_longitude(cls, value: float) -> float:
        if not -180.0 <= value <= 180.0:
            raise ValueError("Longitude must be between -180 and 180 degrees")
        return value


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


class WhatIfRequest(BaseModel):
    node_id: str
    blockage_pct: float = Field(ge=0.0, le=100.0)

    @field_validator("blockage_pct")
    @classmethod
    def validate_blockage(cls, value: float) -> float:
        if not 0.0 <= value <= 100.0:
            raise ValueError("Blockage percentage must be between 0 and 100")
        return value


class WhatIfComparison(BaseModel):
    node_id: str
    blockage_pct: float
    before_depth_cm: float
    after_depth_cm: float
    before_utilisation_pct: float
    after_utilisation_pct: float
    before_risk: RiskLevel
    after_risk: RiskLevel
    before_time_to_flood_min: Optional[int] = None
    after_time_to_flood_min: Optional[int] = None
    additional_affected_roads: List[str] = []
    affected_nodes: List[str] = []


class FloodAlert(BaseModel):
    alert_id: str
    severity: AlertSeverity
    title: str
    message: str
    timestamp_min: int = 0
    related_node_id: Optional[str] = None
    related_segment_id: Optional[str] = None
    is_active: bool = True


class SimulationState(BaseModel):
    scenario: str = "baseline"
    time_min: int = 0
    data_mode: DataMode = DataMode.DEMO
    nodes: List[DrainageNode] = []
    edges: List[DrainageEdge] = []
    roads: List[RoadSegment] = []
    nowcast: NowcastState = Field(default_factory=NowcastState)
    alerts: List[FloodAlert] = []
    critical_nodes: List[str] = []


class HealthResponse(BaseModel):
    status: str = "healthy"
    data_mode: DataMode = DataMode.DEMO
    version: str = "1.0.0"
    components: Dict[str, str] = Field(default_factory=dict)
