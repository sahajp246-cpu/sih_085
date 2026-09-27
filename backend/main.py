"""
FloodTwin — FastAPI Backend
SIH26085 — Urban Flood Nowcasting System
All endpoints serve DEMO data — clearly labelled.
"""

import os
import json
import logging
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from models import (
    RouteRequest, WhatIfRequest, HealthResponse, DataMode,
    SimulationState, DrainageNode, RoadSegment, FloodAlert,
    NowcastState, WhatIfComparison, RouteResponse
)
from simulation_engine import ScenarioEngine

# ── Logging ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("floodtwin")

# ── Engine ─────────────────────────────────────────────────
engine = ScenarioEngine()

# Run initial baseline
engine.run_step("baseline", 0)

# ── App ────────────────────────────────────────────────────
ALLOWED_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app = FastAPI(
    title="FloodTwin API",
    description="SIH26085 — Urban Flood Nowcasting System (DEMO MODE)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


# ── WebSocket Manager ─────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, data: dict):
        message = json.dumps(data, default=str)
        disconnected = []
        for conn in self.active_connections:
            try:
                await conn.send_text(message)
            except Exception:
                disconnected.append(conn)
        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()


# ── Health ─────────────────────────────────────────────────

@app.get("/", tags=["health"])
def root():
    return {"service": "FloodTwin API", "status": "running", "data_mode": "DEMO"}


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health_check():
    return HealthResponse(
        status="healthy",
        data_mode=DataMode.DEMO,
        version="1.0.0",
        components={
            "simulation_engine": "DEMO — deterministic solver",
            "rainfall_nowcast": "DEMO — synthetic storm profiles",
            "hydraulic_model": "DEMO — simplified engineering model (NOT EPA SWMM)",
            "drainage_network": "DEMO — synthetic Chennai pilot catchment",
            "routing": "DEMO — Dijkstra with flood penalties",
            "database": "UNAVAILABLE — in-memory data store",
        }
    )


# ── Simulation Step ────────────────────────────────────────

@app.post("/v1/simulation/step", response_model=SimulationState, tags=["simulation"])
async def run_simulation_step(
    scenario: str = Query("baseline", pattern="^(baseline|moderate_rain|heavy_rain|extreme_rain)$"),
    time_min: int = Query(0, ge=0, le=180),
    blockage_node: Optional[str] = Query(None),
    blockage_pct: float = Query(0.0, ge=0, le=100),
):
    blockages = {}
    if blockage_node and blockage_pct > 0:
        if not engine.get_node(blockage_node):
            raise HTTPException(status_code=404, detail=f"Node {blockage_node} not found")
        blockages[blockage_node] = blockage_pct

    state = engine.run_step(scenario, time_min, blockages)

    await manager.broadcast({
        "event": "flood_state_updated",
        "data": state.model_dump()
    })

    return state


# ── Flood Segments ─────────────────────────────────────────

@app.get("/v1/flood/segments", tags=["flood"])
def get_flood_segments():
    return [r.model_dump() for r in engine.state.roads]


@app.get("/v1/flood/segments/{segment_id}", tags=["flood"])
def get_flood_segment(segment_id: str):
    seg = engine.get_segment(segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    return seg.model_dump()


# ── Drainage ───────────────────────────────────────────────

@app.get("/v1/drainage/nodes", tags=["drainage"])
def get_drainage_nodes():
    return [n.model_dump() for n in engine.state.nodes]


@app.get("/v1/drainage/nodes/critical", tags=["drainage"])
def get_critical_nodes():
    critical_ids = engine.state.critical_nodes
    return [
        n.model_dump() for n in engine.state.nodes
        if n.node_id in critical_ids
    ]


@app.get("/v1/drainage/nodes/{node_id}", tags=["drainage"])
def get_drainage_node(node_id: str):
    node = engine.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node.model_dump()


@app.get("/v1/drainage/edges", tags=["drainage"])
def get_drainage_edges():
    return [e.model_dump() for e in engine.state.edges]


# ── Rainfall Nowcast ───────────────────────────────────────

@app.get("/v1/rainfall/nowcast", response_model=NowcastState, tags=["rainfall"])
def get_nowcast():
    return engine.state.nowcast


# ── What-If ────────────────────────────────────────────────

@app.post("/v1/drainage/whatif", response_model=WhatIfComparison, tags=["whatif"])
async def run_whatif(req: WhatIfRequest):
    if not engine.get_node(req.node_id):
        raise HTTPException(status_code=404, detail=f"Node {req.node_id} not found")
    result = engine.run_whatif(req.node_id, req.blockage_pct)

    await manager.broadcast({
        "event": "whatif_result",
        "data": result.model_dump()
    })

    return result


# ── Routing ────────────────────────────────────────────────

@app.post("/v1/route", response_model=RouteResponse, tags=["routing"])
def compute_route(req: RouteRequest):
    return engine.compute_route(req)


# ── Alerts ─────────────────────────────────────────────────

@app.get("/v1/alerts", response_model=List[FloodAlert], tags=["alerts"])
def get_alerts():
    return engine.state.alerts


# ── Road Closures ──────────────────────────────────────────

@app.get("/v1/roads/closures", tags=["roads"])
def get_road_closures():
    return [
        {"segment_id": r.segment_id, "name": r.name, "depth_cm": r.depth_cm, "risk_level": r.risk_level.value}
        for r in engine.state.roads
        if r.risk_level in ("CRITICAL", "HIGH")
    ]


# ── WebSocket ──────────────────────────────────────────────

@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send current state on connect
        await websocket.send_text(json.dumps({
            "event": "initial_state",
            "data": engine.state.model_dump()
        }, default=str))
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                cmd = msg.get("command")
                if cmd == "step":
                    scenario = msg.get("scenario", "baseline")
                    time_min = msg.get("time_min", 0)
                    blockages = msg.get("blockages", {})
                    state = engine.run_step(scenario, time_min, blockages)
                    await manager.broadcast({
                        "event": "flood_state_updated",
                        "data": state.model_dump()
                    })
            except (json.JSONDecodeError, ValidationError):
                await websocket.send_text(json.dumps({"event": "error", "message": "Invalid command"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
