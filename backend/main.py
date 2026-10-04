"""
FloodTwin Backend API Server

FastAPI application delivering real-time urban flood simulation states,
rainfall nowcast telemetry, what-if blockage diagnostics, and flood-safe routing.
"""

import json
import logging
import os
from typing import Annotated, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from models import (
    DataMode,
    FloodAlert,
    HealthResponse,
    NowcastState,
    RiskLevel,
    RouteRequest,
    RouteResponse,
    SimulationState,
    WhatIfComparison,
    WhatIfRequest,
)
from simulation_engine import ScenarioEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("floodtwin.api")

engine = ScenarioEngine()
engine.run_step("baseline", 0)

DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

ENV_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "").split(",")
    if origin.strip()
]

ALLOWED_ORIGINS = list(set(DEFAULT_ORIGINS + ENV_ORIGINS))

app = FastAPI(
    title="FloodTwin API",
    description="Urban Flood Nowcasting and Hydraulic Simulation Service",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class ConnectionManager:
    """Manages active WebSocket client sessions for streaming simulation updates."""

    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Remaining: {len(self.active_connections)}")

    async def broadcast(self, payload: dict) -> None:
        message = json.dumps(payload, default=str)
        stale_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                stale_connections.append(connection)
        for connection in stale_connections:
            self.disconnect(connection)


ws_manager = ConnectionManager()


@app.get("/", tags=["Health"])
def root() -> Dict[str, str]:
    return {
        "service": "FloodTwin API",
        "status": "online",
        "data_mode": DataMode.DEMO.value,
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
def health_check() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        data_mode=DataMode.DEMO,
        version="1.0.0",
        components={
            "simulation_engine": "operational",
            "rainfall_nowcast": "operational",
            "hydraulic_model": "operational",
            "drainage_network": "operational",
            "routing_solver": "operational",
        },
    )


@app.post("/v1/simulation/step", response_model=SimulationState, tags=["Simulation"])
async def run_simulation_step(
    scenario: Annotated[str, Query(description="Rainfall scenario identifier")] = "baseline",
    time_min: Annotated[int, Query(ge=0, le=180, description="Timeline minute offset")] = 0,
    blockage_node: Annotated[Optional[str], Query(description="Optional node ID with blockage")] = None,
    blockage_pct: Annotated[float, Query(ge=0.0, le=100.0, description="Blockage severity percentage")] = 0.0,
) -> SimulationState:
    blockages: Dict[str, float] = {}
    if blockage_node and blockage_pct > 0.0:
        if not engine.get_node(blockage_node):
            raise HTTPException(status_code=404, detail=f"Drainage node '{blockage_node}' not found")
        blockages[blockage_node] = blockage_pct

    state = engine.run_step(scenario, time_min, blockages)

    await ws_manager.broadcast({
        "event": "flood_state_updated",
        "data": state.model_dump(),
    })

    return state


@app.get("/v1/flood/segments", tags=["Flood Risk"])
def get_flood_segments() -> List[dict]:
    return [segment.model_dump() for segment in engine.state.roads]


@app.get("/v1/flood/segments/{segment_id}", tags=["Flood Risk"])
def get_flood_segment(segment_id: str) -> dict:
    segment = engine.get_segment(segment_id)
    if not segment:
        raise HTTPException(status_code=404, detail=f"Road segment '{segment_id}' not found")
    return segment.model_dump()


@app.get("/v1/drainage/nodes", tags=["Drainage"])
def get_drainage_nodes() -> List[dict]:
    return [node.model_dump() for node in engine.state.nodes]


@app.get("/v1/drainage/nodes/critical", tags=["Drainage"])
def get_critical_nodes() -> List[dict]:
    critical_ids = set(engine.state.critical_nodes)
    return [node.model_dump() for node in engine.state.nodes if node.node_id in critical_ids]


@app.get("/v1/drainage/nodes/{node_id}", tags=["Drainage"])
def get_drainage_node(node_id: str) -> dict:
    node = engine.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Drainage node '{node_id}' not found")
    return node.model_dump()


@app.get("/v1/drainage/edges", tags=["Drainage"])
def get_drainage_edges() -> List[dict]:
    return [edge.model_dump() for edge in engine.state.edges]


@app.get("/v1/rainfall/nowcast", response_model=NowcastState, tags=["Rainfall"])
def get_nowcast() -> NowcastState:
    return engine.state.nowcast


@app.post("/v1/drainage/whatif", response_model=WhatIfComparison, tags=["Analysis"])
async def run_whatif(request: WhatIfRequest) -> WhatIfComparison:
    if not engine.get_node(request.node_id):
        raise HTTPException(status_code=404, detail=f"Drainage node '{request.node_id}' not found")

    result = engine.run_whatif(request.node_id, request.blockage_pct)

    await ws_manager.broadcast({
        "event": "whatif_result",
        "data": result.model_dump(),
    })

    return result


@app.post("/v1/route", response_model=RouteResponse, tags=["Routing"])
def compute_route(request: RouteRequest) -> RouteResponse:
    return engine.compute_route(request)


@app.get("/v1/alerts", response_model=List[FloodAlert], tags=["Alerts"])
def get_alerts() -> List[FloodAlert]:
    return engine.state.alerts


@app.get("/v1/roads/closures", tags=["Roads"])
def get_road_closures() -> List[dict]:
    return [
        {
            "segment_id": road.segment_id,
            "name": road.name,
            "depth_cm": road.depth_cm,
            "risk_level": road.risk_level.value,
        }
        for road in engine.state.roads
        if road.risk_level == RiskLevel.CRITICAL or road.risk_level == RiskLevel.HIGH
    ]


@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    try:
        await websocket.send_text(json.dumps({
            "event": "initial_state",
            "data": engine.state.model_dump(),
        }, default=str))

        while True:
            raw_message = await websocket.receive_text()
            try:
                msg = json.loads(raw_message)
                if msg.get("command") == "step":
                    scenario = msg.get("scenario", "baseline")
                    time_min = int(msg.get("time_min", 0))
                    blockages = msg.get("blockages", {})
                    state = engine.run_step(scenario, time_min, blockages)
                    await ws_manager.broadcast({
                        "event": "flood_state_updated",
                        "data": state.model_dump(),
                    })
            except (json.JSONDecodeError, ValidationError, ValueError):
                await websocket.send_text(json.dumps({
                    "event": "error",
                    "message": "Malformed WebSocket message payload",
                }))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
