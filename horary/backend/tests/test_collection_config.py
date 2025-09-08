import os
import sys
import importlib.util
import types
from pathlib import Path
import pytest
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

def setup_env(monkeypatch, collector_dignity, require=True, app_deg=5.0):
    collector = Planet.JUPITER
    querent = Planet.MERCURY
    quesited = Planet.VENUS

    app_event = {
        'aspect': Aspect.TRINE,
        'timing': 1.0,
        'target': collector,
        'degrees_to_exact': app_deg,
    }

    def fake_is_valid_collector(self, chart, col, q, e):
        return True

    def fake_find_applying_aspect(self, chart, p1, p2, window_days, max_degree=None):
        if (p1, p2) in ((querent, collector), (quesited, collector)):
            if max_degree is not None and app_event['degrees_to_exact'] > max_degree:
                return None
            return app_event
        return None

    def fake_find_earliest_application(self, chart, planet, window_days, exclude=None, max_degree=None):
        if planet in (querent, quesited):
            return {'target': collector, 'timing': 1.0}
        return None

    def fake_get_cached_reception(self, chart, p1, p2):
        return {'one_way': ['x'], 'mutual': 'none', 'type': 'one_way'}

    monkeypatch.setattr(EventDetector, '_is_valid_collector', fake_is_valid_collector)
    monkeypatch.setattr(EventDetector, '_find_applying_aspect', fake_find_applying_aspect)
    monkeypatch.setattr(EventDetector, '_find_earliest_application', fake_find_earliest_application)
    monkeypatch.setattr(EventDetector, '_get_cached_reception', fake_get_cached_reception)

    ed = EventDetector()
    ed.config.collection.require_collector_dignity = require
    ed.config.collection.minimum_dignity_score = 0
    ed.config.collection.max_application_deg = 15.0

    chart = SimpleNamespace(planets={
        collector: SimpleNamespace(dignity_score=collector_dignity),
        querent: SimpleNamespace(),
        quesited: SimpleNamespace(),
    })
    return ed, chart, querent, quesited


def test_collection_dignity_passes(monkeypatch):
    ed, chart, q, e = setup_env(monkeypatch, collector_dignity=2, require=True)
    events = ed._detect_collection_events(chart, q, e, 30)
    assert len(events) == 1


def test_collection_dignity_required(monkeypatch):
    ed, chart, q, e = setup_env(monkeypatch, collector_dignity=-3, require=True)
    assert not ed._detect_collection_events(chart, q, e, 30)


def test_collection_dignity_downgrade(monkeypatch):
    ed, chart, q, e = setup_env(monkeypatch, collector_dignity=-3, require=False)
    events = ed._detect_collection_events(chart, q, e, 30)
    assert len(events) == 1
    evt = events[0]
    assert not evt.favorable
    assert 'collector_poor_dignity' in evt.challenges


@pytest.mark.parametrize('app_deg, expected', [(5.0, 1), (20.0, 0)])
def test_collection_max_application_deg(monkeypatch, app_deg, expected):
    ed, chart, q, e = setup_env(
        monkeypatch, collector_dignity=2, require=True, app_deg=app_deg
    )
    events = ed._detect_collection_events(chart, q, e, 30)
    assert len(events) == expected

