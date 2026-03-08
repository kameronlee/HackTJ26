from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timezone
from math import exp

from .data import DemoDataStore, Edge, haversine_m
from .models import TelemetryReading


@dataclass(slots=True)
class EdgeCorrection:
    edge_id: str
    delta: float


class ForecastProvider:
    def edge_heat(self, edge: Edge) -> float:
        raise NotImplementedError

    def correction_features(self) -> list[dict]:
        raise NotImplementedError


class HeuristicForecastProvider(ForecastProvider):
    def __init__(self, store: DemoDataStore) -> None:
        self.store = store
        self._readings: list[TelemetryReading] = []

    def ingest(self, reading: TelemetryReading) -> None:
        self._readings = [item for item in self._readings if item.device_id != reading.device_id]
        self._readings.append(reading)

    def latest(self) -> list[TelemetryReading]:
        return sorted(self._readings, key=lambda item: item.timestamp)

    def edge_heat(self, edge: Edge) -> float:
        return max(55.0, min(110.0, edge.baseline_heat + self._edge_delta(edge)))

    def correction_features(self) -> list[dict]:
        features: list[dict] = []
        for edge in self.store.edges:
            delta = round(self._edge_delta(edge), 2)
            if abs(delta) < 0.25:
                continue
            start = self.store.nodes[edge.start]
            end = self.store.nodes[edge.end]
            features.append(
                {
                    "type": "Feature",
                    "properties": {"edgeId": edge.id, "delta": delta},
                    "geometry": {
                        "type": "Point",
                        "coordinates": [
                            round((start.lon + end.lon) / 2, 6),
                            round((start.lat + end.lat) / 2, 6),
                        ],
                    },
                }
            )
        return features

    def _edge_delta(self, edge: Edge) -> float:
        if not self._readings:
            return 0.0
        start = self.store.nodes[edge.start]
        end = self.store.nodes[edge.end]
        midpoint_lon = (start.lon + end.lon) / 2
        midpoint_lat = (start.lat + end.lat) / 2
        now = datetime.now(timezone.utc)
        influence = 0.0
        total_weight = 0.0
        for reading in self._readings:
            observed = self._observed_heat_score(reading)
            age_minutes = max(0.0, (now - reading.timestamp).total_seconds() / 60)
            age_weight = exp(-age_minutes / 45)
            distance_km = haversine_m(midpoint_lon, midpoint_lat, reading.lon, reading.lat) / 1000
            spatial_weight = exp(-distance_km / 1.8)
            weight = age_weight * spatial_weight
            if weight < 0.01:
                continue
            influence += (observed - edge.baseline_heat) * weight
            total_weight += weight
        return influence / total_weight if total_weight else 0.0

    @staticmethod
    def _observed_heat_score(reading: TelemetryReading) -> float:
        if reading.heat_index_c is not None:
            return reading.heat_index_c * 2.05
        return reading.temperature_c * 2.1 + reading.humidity_pct * 0.18
