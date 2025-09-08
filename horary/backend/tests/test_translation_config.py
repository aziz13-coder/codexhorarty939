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


def setup_env(monkeypatch, *, sep_timing=-1.0, app_timing=1.0,
              sep_deg=5.0, app_deg=5.0,
              require_reception=False, require_proper_sequence=True,
              reception=False, app_aspect=Aspect.SEXTILE):
    translator = Planet.MERCURY
    querent = Planet.SUN
    quesited = Planet.MARS

    sep_event = {
        'aspect': Aspect.SEXTILE,
        'timing': sep_timing,
        'degrees_from_exact': sep_deg,
        'target': querent,
    }
    app_event = {
        'aspect': app_aspect,
        'timing': app_timing,
        'degrees_to_exact': app_deg,
        'target': quesited,
    }

    def fake_find_separating_aspect(self, chart, p1, p2, window_days, max_degree=None):
        if p1 == translator and p2 in (querent, quesited):
            if max_degree is not None and sep_event['degrees_from_exact'] > max_degree:
                return None
            return sep_event
        return None

    def fake_find_applying_aspect(self, chart, p1, p2, window_days, max_degree=None):
        if p1 == translator and p2 in (querent, quesited):
            if max_degree is not None and app_event['degrees_to_exact'] > max_degree:
                return None
            return app_event
        return None

    def fake_find_earliest_application(self, chart, planet, window_days, exclude=None, max_degree=None):
        return {'target': quesited, 'timing': app_timing}

    def fake_get_cached_reception(self, chart, p1, p2):
        if reception and p1 == translator:
            return {'mutual': 'mixed_reception', 'one_way': ['x'], 'type': 'mixed_reception'}
        return {'mutual': None, 'one_way': [], 'type': 'none'}

    monkeypatch.setattr(EventDetector, '_find_separating_aspect', fake_find_separating_aspect)
    monkeypatch.setattr(EventDetector, '_find_applying_aspect', fake_find_applying_aspect)
    monkeypatch.setattr(EventDetector, '_find_earliest_application', fake_find_earliest_application)
    monkeypatch.setattr(EventDetector, '_get_cached_reception', fake_get_cached_reception)

    ed = EventDetector()
    ed.config.translation.require_speed_advantage = False
    ed.config.translation.require_reception = require_reception
    ed.config.translation.require_proper_sequence = require_proper_sequence
    ed.config.translation.max_separation_deg = 10.0
    ed.config.translation.max_application_deg = 15.0

    ed.timing = SimpleNamespace(_get_daily_motion=lambda pos: getattr(pos, 'daily_motion', 0))

    chart = SimpleNamespace(planets={
        translator: SimpleNamespace(daily_motion=1.0),
        querent: SimpleNamespace(daily_motion=0.5),
        quesited: SimpleNamespace(daily_motion=0.4),
    })
    return ed, chart, querent, quesited


def test_translation_require_reception(monkeypatch):
    ed, chart, q, e = setup_env(monkeypatch, require_reception=True, reception=False)
    assert not ed._detect_translation_events(chart, q, e, 30)

    ed, chart, q, e = setup_env(monkeypatch, require_reception=False, reception=False)
    assert not ed._detect_translation_events(chart, q, e, 30)


def test_translation_require_proper_sequence(monkeypatch):
    ed, chart, q, e = setup_env(monkeypatch, sep_timing=2.0, app_timing=1.0,
                                require_proper_sequence=True)
    assert not ed._detect_translation_events(chart, q, e, 30)

    ed, chart, q, e = setup_env(monkeypatch, sep_timing=2.0, app_timing=1.0,
                                require_proper_sequence=False)
    assert not ed._detect_translation_events(chart, q, e, 30)


@pytest.mark.parametrize('sep_deg, expected', [(10.0, 0), (10.1, 0)])
def test_translation_max_separation_deg_boundary(monkeypatch, sep_deg, expected):
    ed, chart, q, e = setup_env(monkeypatch, sep_deg=sep_deg)
    assert len(ed._detect_translation_events(chart, q, e, 30)) == expected


@pytest.mark.parametrize('app_deg, expected', [(15.0, 0), (15.1, 0)])
def test_translation_max_application_deg_boundary(monkeypatch, app_deg, expected):
    ed, chart, q, e = setup_env(monkeypatch, app_deg=app_deg)
    assert len(ed._detect_translation_events(chart, q, e, 30)) == expected


def test_translation_max_lookback_days(monkeypatch):
    ed, chart, q, e = setup_env(monkeypatch, sep_timing=-10.0, app_aspect=Aspect.SQUARE)
    ed.config.translation_max_lookback_days = 7
    assert not ed._detect_translation_events(chart, q, e, 30)

    ed, chart, q, e = setup_env(monkeypatch, sep_timing=-10.0, app_aspect=Aspect.SQUARE)
    ed.config.translation_max_lookback_days = 15
    assert len(ed._detect_translation_events(chart, q, e, 30)) == 1

