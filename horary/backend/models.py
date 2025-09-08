from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Tuple, Optional
import datetime
import logging
import math
from horary_config import cfg


logger = logging.getLogger(__name__)


class Planet(Enum):
    """Traditional planets and key chart points."""
    SUN = "Sun"
    MOON = "Moon"
    MERCURY = "Mercury"
    VENUS = "Venus"
    MARS = "Mars"
    JUPITER = "Jupiter"
    SATURN = "Saturn"

    ASC = "Ascendant"
    MC = "Midheaven"


class Aspect(Enum):
    """Major Ptolemaic aspects with configurable orbs."""
    CONJUNCTION = (0, "conjunction", "Conjunction")
    SEXTILE = (60, "sextile", "Sextile")
    SQUARE = (90, "square", "Square")
    TRINE = (120, "trine", "Trine")
    OPPOSITION = (180, "opposition", "Opposition")

    def __init__(self, degrees, config_key, display_name):
        self.degrees = degrees
        self.config_key = config_key
        self.display_name = display_name

    @property
    def orb(self) -> float:
        """Get orb from configuration."""
        try:
            return cfg().orbs.__dict__[self.config_key]
        except (AttributeError, KeyError):
            logger.warning(f"Orb not found for {self.config_key}, using default 8.0")
            return 8.0


class Sign(Enum):
    ARIES = (0, "Aries", Planet.MARS)
    TAURUS = (30, "Taurus", Planet.VENUS)
    GEMINI = (60, "Gemini", Planet.MERCURY)
    CANCER = (90, "Cancer", Planet.MOON)
    LEO = (120, "Leo", Planet.SUN)
    VIRGO = (150, "Virgo", Planet.MERCURY)
    LIBRA = (180, "Libra", Planet.VENUS)
    SCORPIO = (210, "Scorpio", Planet.MARS)
    SAGITTARIUS = (240, "Sagittarius", Planet.JUPITER)
    CAPRICORN = (270, "Capricorn", Planet.SATURN)
    AQUARIUS = (300, "Aquarius", Planet.SATURN)
    PISCES = (330, "Pisces", Planet.JUPITER)

    def __init__(self, start_degree, sign_name, ruler):
        self.start_degree = start_degree
        self.sign_name = sign_name
        self.ruler = ruler


class SolarCondition(Enum):
    """Solar conditions affecting planetary dignity."""
    CAZIMI = ("Cazimi", 6, "Heart of the Sun - maximum dignity")
    COMBUSTION = ("Combustion", -5, "Burnt by Sun - severely weakened")
    UNDER_BEAMS = ("Under the Beams", -3, "Obscured by Sun - moderately weakened")
    FREE = ("Free of Sun", 0, "Not affected by solar rays")

    def __init__(self, name, dignity_modifier, description):
        self.condition_name = name
        self.dignity_modifier = dignity_modifier
        self.description = description


@dataclass
class SolarAnalysis:
    """Analysis of planet's relationship to the Sun."""
    planet: Planet
    distance_from_sun: float
    condition: SolarCondition
    exact_cazimi: bool = False
    traditional_exception: bool = False


@dataclass
class PlanetPosition:
    planet: Planet
    longitude: float
    latitude: float
    house: int
    sign: Sign
    dignity_score: int  # Total combined dignity (maintained for backwards compatibility)
    essential_dignity: int = 0  # Score from rulership, exaltation, triplicity, terms, faces, detriment, fall
    accidental_dignity: int = 0  # Score from house placement, angularity, speed, retrograde, hayz, solar conditions
    retrograde: bool = False
    speed: float = 0.0  # degrees per day
    dignities: List[str] = field(default_factory=list)


@dataclass
class AspectInfo:
    planet1: Planet
    planet2: Planet
    aspect: Aspect
    orb: float
    applying: bool
    time_to_perfection: float = math.inf
    perfection_within_sign: bool = True
    exact_time: Optional[datetime.datetime] = None
    degrees_to_exact: float = 0.0


@dataclass
class LunarAspect:
    """Enhanced lunar aspect information."""
    planet: Planet
    aspect: Aspect
    orb: float
    degrees_difference: float
    perfection_eta_days: float
    perfection_eta_description: str
    applying: bool


@dataclass
class Significator:
    """Represents a significator in horary astrology."""
    planet: Planet
    house_ruled: int
    position: PlanetPosition
    role: str  # "querent", "quesited", etc.


@dataclass
class HoraryChart:
    date_time: datetime.datetime
    date_time_utc: datetime.datetime  # UTC time for calculations
    timezone_info: str  # Timezone information
    location: Tuple[float, float]  # (latitude, longitude)
    location_name: str
    planets: Dict[Planet, PlanetPosition]
    aspects: List[AspectInfo]
    houses: List[float]  # House cusps in degrees
    house_rulers: Dict[int, Planet]  # Which planet rules each house
    ascendant: float
    midheaven: float
    solar_analyses: Optional[Dict[Planet, SolarAnalysis]] = None
    julian_day: float = 0.0
    moon_last_aspect: Optional[LunarAspect] = None
    moon_next_aspect: Optional[LunarAspect] = None

