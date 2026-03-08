from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from heapq import heappop, heappush
from typing import Callable

from .data import DemoDataStore, Edge, haversine_m
from .forecast import ForecastProvider
from .models import Coordinate, RouteOption, RouteRequest, RouteResponse


@dataclass(slots=True)
class PathResult:
    edge_ids: list[str]
    node_ids: list[str]
    distance_m: float
    duration_min: float
    heat_score: float
    shade_pct: float
    vulnerability_tracts: list[str]


class RouteService:
    def __init__(self, store: DemoDataStore, forecast: ForecastProvider) -> None:
        self.store = store
        self.forecast = forecast
        self.adjacency = defaultdict(list)
        self.edge_lookup = {}
        for edge in self.store.edges:
            self.edge_lookup[edge.id] = edge
            self.adjacency[edge.start].append((edge.end, edge))
            self.adjacency[edge.end].append((edge.start, edge))

    def compute_routes(self, request: RouteRequest) -> RouteResponse:
        origin_node = self._nearest_node(request.origin.coordinate)
        destination_node = self._nearest_node(request.destination.coordinate, region=self.store.nodes[origin_node].region)
        fastest = self._dijkstra(origin_node, destination_node, self._fast_weight)
        coolest = self._dijkstra(origin_node, destination_node, self._cool_weight)
        balanced = self._dijkstra(origin_node, destination_node, self._balanced_weight)

        options = [
            self._to_option("fastest", "Fastest", fastest, fastest),
            self._to_option("coolest", "Coolest", coolest, fastest),
            self._to_option("balanced", "Balanced", balanced, fastest),
        ]
        return RouteResponse(options=options, selectedMode=request.mode)

    def _nearest_node(self, coordinate: Coordinate, region: str | None = None) -> str:
        best_id = ""
        best_distance = float("inf")
        for node in self.store.nodes.values():
            if region and node.region != region:
                continue
            distance = haversine_m(coordinate.lon, coordinate.lat, node.lon, node.lat)
            if distance < best_distance:
                best_distance = distance
                best_id = node.id
        if not best_id:
            raise ValueError("No node found for requested region")
        return best_id

    def _dijkstra(self, start: str, end: str, weight_fn: Callable[[Edge], float]) -> PathResult:
        heap = [(0.0, start, [], [start])]
        best_cost = {start: 0.0}
        while heap:
            cost, node_id, edge_ids, node_ids = heappop(heap)
            if node_id == end:
                return self._summarize(edge_ids, node_ids)
            if cost > best_cost.get(node_id, float("inf")):
                continue
            for neighbor_id, edge in self.adjacency[node_id]:
                next_cost = cost + weight_fn(edge)
                if next_cost >= best_cost.get(neighbor_id, float("inf")):
                    continue
                best_cost[neighbor_id] = next_cost
                heappush(heap, (next_cost, neighbor_id, edge_ids + [edge.id], node_ids + [neighbor_id]))
        raise ValueError("No route found between origin and destination")

    def _summarize(self, edge_ids: list[str], node_ids: list[str]) -> PathResult:
        edges = [self.edge_lookup[edge_id] for edge_id in edge_ids]
        distance_m = sum(edge.distance_m for edge in edges)
        duration_min = sum(self._edge_duration_min(edge) for edge in edges)
        heat_burdens = [self._edge_heat_burden(edge) for edge in edges]
        heat_score = sum((burden * edge.distance_m) for burden, edge in zip(heat_burdens, edges)) / max(distance_m, 1)
        shade_pct = sum(edge.shade * edge.distance_m for edge in edges) / max(distance_m, 1)
        vulnerability_tracts = list(dict.fromkeys(edge.tract_id for edge in edges))
        return PathResult(
            edge_ids=edge_ids,
            node_ids=node_ids,
            distance_m=round(distance_m, 1),
            duration_min=round(duration_min, 1),
            heat_score=round(heat_score, 1),
            shade_pct=round(shade_pct * 100, 1),
            vulnerability_tracts=vulnerability_tracts,
        )

    def _to_option(self, option_id: str, label: str, result: PathResult, fastest: PathResult) -> RouteOption:
        extra_minutes = max(0.0, result.duration_min - fastest.duration_min)
        heat_reduction = max(0.0, fastest.heat_score - result.heat_score)
        tradeoff = round(heat_reduction - (extra_minutes * 1.4), 1)
        coordinates = [[self.store.nodes[node_id].lon, self.store.nodes[node_id].lat] for node_id in result.node_ids]
        return RouteOption(
            id=option_id,
            label=label,
            distanceM=result.distance_m,
            durationMin=result.duration_min,
            heatScore=result.heat_score,
            shadePct=result.shade_pct,
            tradeoffScore=tradeoff,
            vulnerabilityTracts=result.vulnerability_tracts,
            geojson={
                "type": "Feature",
                "properties": {"id": option_id, "label": label},
                "geometry": {"type": "LineString", "coordinates": coordinates},
            },
        )

    def _edge_duration_min(self, edge: Edge) -> float:
        base_speed_mps = 1.32
        slope_penalty = min(0.45, abs(edge.slope) * 4.2)
        shade_bonus = edge.shade * 0.08
        vegetation_bonus = edge.vegetation * 0.04
        adjusted_speed = max(0.7, base_speed_mps * (1 - slope_penalty + shade_bonus + vegetation_bonus))
        return edge.distance_m / adjusted_speed / 60

    def _edge_heat_burden(self, edge: Edge) -> float:
        heat = self.forecast.edge_heat(edge)
        return heat * (1 - edge.shade * 0.55 - edge.vegetation * 0.24) + abs(edge.slope) * 35

    def _fast_weight(self, edge: Edge) -> float:
        return self._edge_duration_min(edge)

    def _cool_weight(self, edge: Edge) -> float:
        return (edge.distance_m / 320) + self._edge_heat_burden(edge)

    def _balanced_weight(self, edge: Edge) -> float:
        return (self._fast_weight(edge) * 3.2) + (self._cool_weight(edge) * 0.55)
