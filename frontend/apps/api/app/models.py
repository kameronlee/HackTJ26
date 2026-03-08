from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class Coordinate(BaseModel):
    lon: float
    lat: float


class RouteLocation(BaseModel):
    label: str | None = None
    location_id: str | None = Field(default=None, alias="locationId")
    coordinate: Coordinate

    model_config = {"populate_by_name": True}


class RouteRequest(BaseModel):
    origin: RouteLocation
    destination: RouteLocation
    departure_time: datetime | None = Field(default=None, alias="departureTime")
    mode: Literal["fastest", "coolest", "balanced"] = "balanced"

    model_config = {"populate_by_name": True}


class RouteOption(BaseModel):
    id: str
    label: str
    distance_m: float = Field(alias="distanceM")
    duration_min: float = Field(alias="durationMin")
    heat_score: float = Field(alias="heatScore")
    shade_pct: float = Field(alias="shadePct")
    tradeoff_score: float = Field(alias="tradeoffScore")
    vulnerability_tracts: list[str] = Field(alias="vulnerabilityTracts")
    geojson: dict[str, Any]

    model_config = {"populate_by_name": True}


class RouteResponse(BaseModel):
    options: list[RouteOption]
    selected_mode: str = Field(alias="selectedMode")

    model_config = {"populate_by_name": True}


class TelemetryReading(BaseModel):
    device_id: str = Field(alias="deviceId")
    timestamp: datetime
    lat: float
    lon: float
    temperature_c: float = Field(alias="temperatureC")
    humidity_pct: float = Field(alias="humidityPct")
    heat_index_c: float | None = Field(default=None, alias="heatIndexC")
    battery_v: float | None = Field(default=None, alias="batteryV")
    source: Literal["live", "replay"] = "replay"

    model_config = {"populate_by_name": True}


class LayersResponse(BaseModel):
    regions: list[dict[str, Any]]
    locations: list[dict[str, Any]]
    heat_surface: dict[str, Any] = Field(alias="heatSurface")
    vulnerability_overlay: dict[str, Any] = Field(alias="vulnerabilityOverlay")
    telemetry_points: list[TelemetryReading] = Field(alias="telemetryPoints")
    replay_mode: Literal["idle", "running"] = Field(alias="replayMode")

    model_config = {"populate_by_name": True}


class MapLayerState(BaseModel):
    heat_surface: dict[str, Any] = Field(alias="heatSurface")
    telemetry_points: list[TelemetryReading] = Field(alias="telemetryPoints")
    vulnerability_overlay: dict[str, Any] = Field(alias="vulnerabilityOverlay")
    route_options: list[RouteOption] = Field(alias="routeOptions")

    model_config = {"populate_by_name": True}
