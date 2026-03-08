from __future__ import annotations

import json
from dataclasses import dataclass
from math import atan2, cos, radians, sin, sqrt
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data" / "processed"


@dataclass(slots=True)
class Node:
    id: str
    lon: float
    lat: float
    region: str


@dataclass(slots=True)
class Edge:
    id: str
    start: str
    end: str
    distance_m: float
    slope: float
    shade: float
    vegetation: float
    baseline_heat: float
    tract_id: str


class DemoDataStore:
    def __init__(self) -> None:
        self.locations_payload = self._load_json(DATA_DIR / "locations.json")
        self.graph_payload = self._load_json(DATA_DIR / "graph.json")
        self.heat_surface = self._load_json(DATA_DIR / "heat_surface.geojson")
        self.vulnerability_overlay = self._load_json(DATA_DIR / "vulnerability.geojson")
        self.telemetry_replay_path = DATA_DIR / "telemetry_replay.jsonl"

        self.regions = self.locations_payload["regions"]
        self.locations = self.locations_payload["locations"]
        self.nodes = {
            item["id"]: Node(**item) for item in self.graph_payload["nodes"]
        }
        self.edges = [
            Edge(
                id=item["id"],
                start=item["from"],
                end=item["to"],
                distance_m=item["distance_m"],
                slope=item["slope"],
                shade=item["shade"],
                vegetation=item["vegetation"],
                baseline_heat=item["baseline_heat"],
                tract_id=item["tract_id"],
            )
            for item in self.graph_payload["edges"]
        ]
        self.tract_lookup = {
            feature["properties"]["tract_id"]: feature["properties"]
            for feature in self.vulnerability_overlay["features"]
        }

    @staticmethod
    def _load_json(path: Path) -> dict[str, Any]:
        return json.loads(path.read_text())


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    radius = 6_371_000
    dlon = radians(lon2 - lon1)
    dlat = radians(lat2 - lat1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return radius * c
