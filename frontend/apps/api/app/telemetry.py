from __future__ import annotations

import asyncio
import json

from fastapi import WebSocket

from .data import DemoDataStore
from .forecast import HeuristicForecastProvider
from .models import TelemetryReading


class TelemetryHub:
    def __init__(self, store: DemoDataStore, forecast: HeuristicForecastProvider) -> None:
        self.store = store
        self.forecast = forecast
        self._connections: list[WebSocket] = []
        self._replay_task: asyncio.Task | None = None
        self._replay_mode = "idle"

    @property
    def replay_mode(self) -> str:
        return self._replay_mode

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)
        await websocket.send_json(self.snapshot_event())

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections = [item for item in self._connections if item is not websocket]

    def snapshot_event(self) -> dict:
        return {
            "type": "telemetry.snapshot",
            "payload": {
                "telemetryPoints": [item.model_dump(by_alias=True, mode="json") for item in self.forecast.latest()],
                "corrections": {
                    "type": "FeatureCollection",
                    "features": self.forecast.correction_features(),
                },
                "replayMode": self._replay_mode,
            },
        }

    async def ingest(self, payload: dict, source: str) -> TelemetryReading:
        reading = TelemetryReading.model_validate({**payload, "source": source})
        self.forecast.ingest(reading)
        await self.broadcast(self.snapshot_event())
        return reading

    async def broadcast(self, event: dict) -> None:
        stale: list[WebSocket] = []
        for connection in self._connections:
            try:
                await connection.send_json(event)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)

    async def start_replay(self, interval_seconds: float = 1.0) -> None:
        if self._replay_task and not self._replay_task.done():
            return
        self._replay_mode = "running"
        await self.broadcast(self.snapshot_event())
        self._replay_task = asyncio.create_task(self._run_replay(interval_seconds))

    def _replay_lines(self) -> list[dict]:
        lines = self.store.telemetry_replay_path.read_text().splitlines()
        return [json.loads(line) for line in lines if line.strip()]

    async def _run_replay(self, interval_seconds: float) -> None:
        try:
            for payload in self._replay_lines():
                await self.ingest(payload, source="replay")
                await asyncio.sleep(interval_seconds)
        finally:
            self._replay_mode = "idle"
            await self.broadcast(self.snapshot_event())
