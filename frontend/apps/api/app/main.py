from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .data import DemoDataStore
from .forecast import HeuristicForecastProvider
from .models import LayersResponse, RouteRequest, TelemetryReading
from .routing import RouteService
from .telemetry import TelemetryHub

store = DemoDataStore()
forecast = HeuristicForecastProvider(store)
routes = RouteService(store, forecast)
hub = TelemetryHub(store, forecast)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="Urban Heat Island Router API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "regions": len(store.regions), "locations": len(store.locations)}


@app.get("/layers", response_model=LayersResponse)
def layers() -> LayersResponse:
    return LayersResponse(
        regions=store.regions,
        locations=store.locations,
        heatSurface=store.heat_surface,
        vulnerabilityOverlay=store.vulnerability_overlay,
        telemetryPoints=forecast.latest(),
        replayMode=hub.replay_mode,
    )


@app.post("/route")
def route(request: RouteRequest):
    try:
        return routes.compute_routes(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/telemetry/latest")
def telemetry_latest() -> dict:
    return {
        "telemetryPoints": [item.model_dump(by_alias=True, mode="json") for item in forecast.latest()],
        "corrections": {"type": "FeatureCollection", "features": forecast.correction_features()},
        "replayMode": hub.replay_mode,
    }


@app.post("/telemetry/replay/start")
async def telemetry_replay_start() -> dict:
    await hub.start_replay()
    return {"status": "started"}


@app.post("/telemetry/ingest", response_model=TelemetryReading)
async def telemetry_ingest(payload: dict):
    return await hub.ingest(payload, source="live")


@app.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket):
    await hub.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(websocket)
