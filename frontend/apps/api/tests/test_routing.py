from app.data import DemoDataStore
from app.forecast import HeuristicForecastProvider
from app.models import Coordinate, RouteLocation, RouteRequest, TelemetryReading
from app.routing import RouteService


def test_route_service_prefers_cooler_path_for_coolest_mode():
    store = DemoDataStore()
    forecast = HeuristicForecastProvider(store)
    service = RouteService(store, forecast)
    request = RouteRequest(
        origin=RouteLocation(label="Union Station", coordinate=Coordinate(lon=-77.0064, lat=38.8971)),
        destination=RouteLocation(label="Eastern Market", coordinate=Coordinate(lon=-76.9956, lat=38.8842)),
        mode="balanced",
    )

    response = service.compute_routes(request)
    fastest = next(option for option in response.options if option.id == "fastest")
    coolest = next(option for option in response.options if option.id == "coolest")

    assert coolest.heat_score < fastest.heat_score
    assert coolest.distance_m > fastest.distance_m


def test_forecast_provider_applies_sensor_correction():
    store = DemoDataStore()
    forecast = HeuristicForecastProvider(store)
    edge = store.edges[0]
    baseline = forecast.edge_heat(edge)

    forecast.ingest(
        TelemetryReading(
            deviceId="sensor-test",
            timestamp="2026-07-14T16:00:00Z",
            lat=38.8970,
            lon=-77.0060,
            temperatureC=38.0,
            humidityPct=61.0,
            heatIndexC=43.0,
            source="live",
        )
    )

    assert forecast.edge_heat(edge) > baseline
