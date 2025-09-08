import os
import sys
import importlib.util
import types
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault('HORARY_CONFIG_SKIP_VALIDATION', 'true')
base_dir = Path(__file__).resolve().parents[1]
sys.path.append(str(base_dir))

pkg = types.ModuleType("horary_engine")
pkg.__path__ = [str(base_dir / "horary_engine")]
sys.modules["horary_engine"] = pkg
spec = importlib.util.spec_from_file_location(
    "horary_engine.perfection_core", base_dir / "horary_engine" / "perfection_core.py"
)
perfection_core = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = perfection_core
spec.loader.exec_module(perfection_core)

EventDetector = perfection_core.EventDetector
from models import Planet, Aspect


def test_find_applying_aspect_respects_max_degree():
    ed = EventDetector()
    ed.timing = SimpleNamespace(
        when_exact_in_days=lambda p1, p2, aspect, chart: 10.0,
        _get_daily_motion=lambda pos: pos.speed,
    )
    chart = SimpleNamespace(planets={
        Planet.MERCURY: SimpleNamespace(speed=1.0),
        Planet.MARS: SimpleNamespace(speed=0.6),
    })
    # Close aspect within 5 degrees
    assert ed._find_applying_aspect(chart, Planet.MERCURY, Planet.MARS, 30, max_degree=5.0)
    # Wide aspect beyond 5 degrees
    chart.planets[Planet.MARS].speed = 0.4
    assert ed._find_applying_aspect(chart, Planet.MERCURY, Planet.MARS, 30, max_degree=5.0) is None


def test_find_separating_aspect_respects_max_degree():
    ed = EventDetector()
    ed.timing = SimpleNamespace(_get_daily_motion=lambda pos: pos.speed)
    # Close separation within 10 degrees
    chart = SimpleNamespace(planets={
        Planet.MERCURY: SimpleNamespace(longitude=0.0, speed=1.0),
        Planet.MARS: SimpleNamespace(longitude=5.0, speed=2.0),
    })
    assert ed._find_separating_aspect(chart, Planet.MERCURY, Planet.MARS, 30, max_degree=10.0)
    # Wide separation beyond 10 degrees
    chart.planets[Planet.MARS].longitude = 12.0
    assert ed._find_separating_aspect(chart, Planet.MERCURY, Planet.MARS, 30, max_degree=10.0) is None
