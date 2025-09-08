import os
import sys
import datetime
from pathlib import Path
from unittest.mock import patch
import importlib.util
import types

os.environ.setdefault('HORARY_CONFIG_SKIP_VALIDATION', 'true')

# Manually load perfection_core without importing horary_engine.__init__
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

TimingKernel = perfection_core.TimingKernel
EventDetector = perfection_core.EventDetector

from models import Planet, PlanetPosition, HoraryChart, Sign


class DummyPos:
    def __init__(self, daily_motion=None, speed=None):
        if daily_motion is not None:
            self.daily_motion = daily_motion
        if speed is not None:
            self.speed = speed


def test_get_daily_motion_prefers_daily_motion():
    tk = TimingKernel()
    pos = DummyPos(daily_motion=1.2, speed=2.3)
    assert tk._get_daily_motion(pos) == 1.2


def test_get_daily_motion_falls_back_to_speed():
    tk = TimingKernel()
    pos = DummyPos(speed=2.3)
    assert tk._get_daily_motion(pos) == 2.3


def test_event_detector_uses_timing_kernel_speed_lookup():
    ed = EventDetector()
    chart = HoraryChart(
        date_time=datetime.datetime(2023, 1, 1),
        date_time_utc=datetime.datetime(2023, 1, 1),
        timezone_info='UTC',
        location=(0.0, 0.0),
        location_name='Test',
        planets={
            Planet.MOON: PlanetPosition(
                planet=Planet.MOON,
                longitude=10.0,
                latitude=0.0,
                house=1,
                sign=Sign.ARIES,
                dignity_score=0,
            )
        },
        aspects=[],
        houses=[],
        house_rulers={},
        ascendant=0.0,
        midheaven=0.0,
    )
    with patch.object(ed.timing, "_get_daily_motion", return_value=12.5) as mock_dm:
        house = ed._house_at_future_time(chart, Planet.MOON, 2)
        mock_dm.assert_called_once()
        assert house == 2
