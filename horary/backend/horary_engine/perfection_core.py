"""
Unified Perfection Detection Module

This module consolidates all perfection detection logic from engine.py and perfection.py
into a single, coherent API with improved timing calculations and strict rules.

Key Features:
- Single timing kernel with moiety orbs and retrograde handling
- Strict collector and translator rules
- Unified event detection (direct, translation, collection, prohibition, etc.)
- Reception caching and first-class reception metrics
- Deterministic tie-breaking and event de-duplication
- Timeline-based event selection with pre-emption logic
"""

from __future__ import annotations
from typing import Dict, List, Optional, Tuple, Set, Any, NamedTuple
from dataclasses import dataclass, field
from enum import Enum
import math

# Global tolerance for time comparisons (days)
EPS = 1e-3  # ~1.44 minutes

from horary_config import cfg
from .reception import TraditionalReceptionCalculator

try:
    from ..models import Planet, Aspect, HoraryChart, SolarCondition
except ImportError:  # pragma: no cover
    from models import Planet, Aspect, HoraryChart, SolarCondition


class EventType(Enum):
    """Types of perfection events that can be detected"""
    DIRECT = "direct"
    DIRECT_PENALIZED = "direct_penalized" 
    HOUSE_PLACEMENT = "house_placement"
    TRANSLATION = "translation"
    COLLECTION = "collection"
    PROHIBITION = "prohibition"
    ABSCISSION = "abscission"
    REFRANATION = "refranation"
    FRUSTRATION = "frustration"
    COMBUSTION_VETO = "combustion_veto"


@dataclass
class PerfectionEvent:
    """Normalized perfection event with complete metadata"""
    event_type: EventType
    primary_pair: Tuple[Planet, Planet]  # (querent, quesited)
    mediator: Optional[Planet] = None  # For translation/collection/prohibition
    aspect: Optional[Aspect] = None
    reception_data: Optional[Dict] = None
    exact_in_days: Optional[float] = None
    favorable: bool = True
    confidence: Optional[int] = None
    reason: str = ""
    challenges: List[str] = field(default_factory=list)
    quality_tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def event_key(self) -> str:
        """Stable key for de-duplication"""
        mediator_key = self.mediator.value if self.mediator else "none"
        aspect_key = self.aspect.value if self.aspect else "none" 
        timing_key = round(self.exact_in_days, 4) if self.exact_in_days else 0.0
        return f"{self.event_type.value}:{self.primary_pair[0].value}:{self.primary_pair[1].value}:{mediator_key}:{aspect_key}:{timing_key}"


class TimingKernel:
    """Single timing calculation engine with moiety orbs and retrograde handling"""
    
    def __init__(self):
        self.config = cfg()
        self.reception_calc = TraditionalReceptionCalculator()
    
    def _get_daily_motion(self, planet_pos) -> float:
        """Get daily motion with fallback to speed attribute"""
        if not planet_pos:
            return 0.0
        
        # Try daily_motion first
        daily_motion = getattr(planet_pos, 'daily_motion', None)
        if daily_motion is not None:
            return daily_motion
        
        # Fall back to speed attribute
        speed = getattr(planet_pos, 'speed', None)
        if speed is not None:
            return speed
            
        return 0.0

    def _current_direct_route(self, chart: HoraryChart, querent: Planet, quesited: Planet, window_days: int):
        """
        Return the earliest direct perfection between significators within window,
        with applier/receiver determined by relative speed proxy (daily motion).
        """
        best = None
        for aspect in [Aspect.CONJUNCTION, Aspect.SEXTILE, Aspect.SQUARE, Aspect.TRINE, Aspect.OPPOSITION]:
            # call local kernel method; no self.timing here
            t = self.when_exact_in_days(querent, quesited, aspect, chart)
            if t is None or t > window_days:
                continue
            qa = chart.planets.get(querent)
            qe = chart.planets.get(quesited)
            sp_q = abs(self._get_daily_motion(qa))
            sp_e = abs(self._get_daily_motion(qe))
            applier, receiver = (querent, quesited) if sp_q >= sp_e else (quesited, querent)
            cand = {'aspect': aspect, 'timing': float(t), 'applier': applier, 'receiver': receiver}
            if best is None or cand['timing'] < best['timing']:
                best = cand
        return best
        
    def when_exact_in_days(self, planet_a: Planet, planet_b: Planet, aspect: Aspect, 
                          chart: HoraryChart, use_moiety: bool = True) -> Optional[float]:
        """
        Unified timing calculation using analytic relative motion (no "must be in orb" gate).
        Returns days until the *next* (forward-only) exact hit of `aspect`,
        or None if relative motion is ~0 or sign-exit occurs first.
        """
        pos_a = chart.planets.get(planet_a)
        pos_b = chart.planets.get(planet_b)
        if not pos_a or not pos_b:
            return None
        lon_a = getattr(pos_a, 'longitude', 0.0)
        lon_b = getattr(pos_b, 'longitude', 0.0)
        target = getattr(aspect, 'degrees', None)
        if target is None:
            return None

        # Signed minimal offset from exact (in -180..180], then solve for time
        # with a forward-only root (add whole 360°/|v_rel| periods if needed).
        # IMPORTANT: symmetric aspects (sextile/square/trine) perfect at ±A; opposition at ±180.
        sep_now = (lon_b - lon_a + 180.0) % 360.0 - 180.0  # b - a in [-180,180]

        # Determine candidate target separations for this aspect geometry
        if target == 0:
            targets = [0.0]
        elif target == 180:
            targets = [180.0, -180.0]
        else:
            targets = [float(target), -float(target)]

        def _norm180(x: float) -> float:
            return ((x + 180.0) % 360.0) - 180.0

        # Compute minimal signed delta to the nearest equivalent target
        deltas = [_norm180(sep_now - t) for t in targets]
        delta = min(deltas, key=lambda d: abs(d))

        v_rel = self._get_daily_motion(pos_b) - self._get_daily_motion(pos_a)
        
        print(f"         TIMING DEBUG: {planet_a.value} ({lon_a:.2f}°) vs {planet_b.value} ({lon_b:.2f}°)")
        print(f"         Current separation: {sep_now:.2f}°, Target: {target}°")
        print(f"         Speed A: {self._get_daily_motion(pos_a):.4f}°/day, Speed B: {self._get_daily_motion(pos_b):.4f}°/day")
        print(f"         Relative speed: {v_rel:.4f}°/day, Delta to exact: {delta:.2f}°")
        
        if abs(v_rel) < 1e-6:
            print(f"         No relative motion - planets moving at same speed")
            if abs(delta) < 1e-3:
                print(f"         Already exact!")
                return 0.0
            return None
        t = -delta / v_rel
        print(f"         Raw timing: {t:.2f} days")
        
        if t <= 0.0:
            period = 360.0 / abs(v_rel)
            k = int((-t) // period + 1)
            t = t + k * period
            print(f"         Adjusted for future perfection: {t:.2f} days (added {k} periods)")

        # Guard: perfection must occur before either planet exits its current sign,
        # unless config allows out-of-sign hits.
        from .calculation.helpers import days_to_sign_exit as _days_to_sign_exit
        cfg_obj = self.config
        # Two-level control: top-level allow_out_of_sign_hits, and perfection.*
        allow_cross_top = getattr(cfg_obj, 'allow_out_of_sign_hits', False)
        perfection_cfg = getattr(cfg_obj, 'perfection', type('X', (), {})())
        allow_cross_perf = getattr(perfection_cfg, 'allow_out_of_sign', False)
        require_in_sign = getattr(perfection_cfg, 'require_in_sign', True)
        enforce_sign_guard = (not allow_cross_top) and (not allow_cross_perf) and bool(require_in_sign)

        if enforce_sign_guard:
            days_a = _days_to_sign_exit(lon_a, getattr(pos_a, 'speed', 0.0))
            days_b = _days_to_sign_exit(lon_b, getattr(pos_b, 'speed', 0.0))
            if getattr(cfg_obj, 'debug_sign_exit_guard', False):
                print(f"         Sign exit check - A: {days_a} days, B: {days_b} days")
            if (days_a is not None and t > days_a) or (days_b is not None and t > days_b):
                if getattr(cfg_obj, 'debug_sign_exit_guard', False):
                    print(f"         BLOCKED: Perfection after sign exit")
                return None

        print(f"         FINAL TIMING: {t:.2f} days")
        return float(t)
    


class EventDetector:
    """Unified event detection for all perfection types"""
    
    def __init__(self):
        self.timing = TimingKernel()
        self.config = cfg()
        self.reception_cache: Dict[str, Dict] = {}
    
    def _get_daily_motion(self, planet_pos) -> float:
        """Get daily motion with fallback to speed attribute"""
        if not planet_pos:
            return 0.0
        
        # Try daily_motion first
        daily_motion = getattr(planet_pos, 'daily_motion', None)
        if daily_motion is not None:
            return daily_motion
        
        # Fall back to speed attribute
        speed = getattr(planet_pos, 'speed', None)
        if speed is not None:
            return speed
            
        return 0.0

    # Bridge helper to reuse TimingKernel's direct route computation
    def _current_direct_route(self, chart: HoraryChart, querent: Planet, quesited: Planet, window_days: int):
        """Delegate to TimingKernel to determine earliest direct route with applier/receiver."""
        try:
            return self.timing._current_direct_route(chart, querent, quesited, window_days)
        except AttributeError:
            # Fallback: no route available
            return None
    
    def detect_all_events(self, chart: HoraryChart, querent: Planet, quesited: Planet,
                         window_days: int = 30) -> List[PerfectionEvent]:
        """
        Detect all relevant perfection events within the time window.
        
        Returns:
            List of all detected events, sorted by timing and quality
        """
        print(f"\n--- DETECTING ALL PERFECTION EVENTS ---")
        events = []

        # === SAME RULER / IDENTITY CASE ===
        if querent == quesited:
            print(f"SAME RULER CASE: {querent.value} rules both significators")
            # House placement testimony still matters
            events.extend(self._detect_house_placement_events(chart, querent, quesited))
            # Emit an identity/direct event with immediate timing
            events.append(PerfectionEvent(
                event_type=EventType.DIRECT,
                primary_pair=(querent, quesited),
                aspect=Aspect.CONJUNCTION,
                exact_in_days=0.0,
                favorable=True,
                confidence=getattr(self.config.confidence.perfection, "same_ruler", 80),
                reason="Same planet rules both significators — unity of matter & querent"
            ))
            print(f"Created identity perfection event")
            return self._sort_events_by_priority(self._deduplicate_events(events))
        
        # 1. Direct perfections (including combustion veto)
        print(f"1. Checking direct aspects between {querent.value} and {quesited.value}")
        direct_events = self._detect_direct_events(chart, querent, quesited, window_days)
        print(f"   Found {len(direct_events)} direct events")
        events.extend(direct_events)
        
        # 2. House placement perfections  
        print(f"2. Checking house placement perfections")
        house_events = self._detect_house_placement_events(chart, querent, quesited)
        print(f"   Found {len(house_events)} house placement events")
        events.extend(house_events)
        
        # 3. Translation events
        print(f"3. Checking translation of light events")
        translation_events = self._detect_translation_events(chart, querent, quesited, window_days)
        print(f"   Found {len(translation_events)} translation events")
        events.extend(translation_events)
        
        # 4. Collection events
        print(f"4. Checking collection of light events")
        collection_events = self._detect_collection_events(chart, querent, quesited, window_days)
        print(f"   Found {len(collection_events)} collection events")
        events.extend(collection_events)
        
        # 5. Prohibition events (pre-emption sweep)
        print(f"5. Checking prohibition events")
        # compute earliest positive among detected direct/translation/collection
        positive_types = {EventType.DIRECT, EventType.DIRECT_PENALIZED, EventType.TRANSLATION, EventType.COLLECTION}
        earliest_positive_time = min((e.exact_in_days for e in events if e.event_type in positive_types and e.exact_in_days is not None), default=None)
        events.extend(self._detect_prohibition_events(chart, querent, quesited, window_days, earliest_positive_time=earliest_positive_time))
        
        # 6. Denial events (abscission, refranation, frustration)
        events.extend(self._detect_denial_events(chart, querent, quesited, window_days))
        
        # De-duplicate, de-conflict and sort
        events = self._deduplicate_events(events)
        events = self._deconflict_same_time(events)
        events = self._sort_events_by_priority(events)
        
        return events
    
    def _detect_direct_events(self, chart: HoraryChart, querent: Planet, quesited: Planet,
                              window_days: int) -> List[PerfectionEvent]:
        """Detect direct aspect perfections with combustion conjunction veto"""
        print(f"   DIRECT ASPECTS DEBUG:")
        events = []
        
        # Evaluate all five geometries, then keep only the earliest valid within window
        candidates = []
        for aspect in [Aspect.CONJUNCTION, Aspect.SEXTILE, Aspect.SQUARE, Aspect.TRINE, Aspect.OPPOSITION]:
            print(f"     Checking {aspect.display_name} ({aspect.degrees}°)")
            timing = self.timing.when_exact_in_days(querent, quesited, aspect, chart)
            print(f"       Timing calculation: {timing} days" if timing is not None else "       No valid timing found")
            if timing is None or timing > window_days:
                continue
            candidates.append((aspect, timing))

        if not candidates:
            return events

        # Select the earliest candidate
        aspect, timing = min(candidates, key=lambda x: x[1])
        reception_data = self._get_cached_reception(chart, querent, quesited)
        print(f"       Reception data: {reception_data}")

        # COMBUSTION CONJUNCTION VETO for selected aspect only
        if aspect == Aspect.CONJUNCTION and self._is_combustion_conjunction(chart, querent, quesited):
            other = quesited if querent == Planet.SUN else (querent if quesited == Planet.SUN else None)
            reason = ("Combustion at conjunction prevents perfection"
                      if other is None else
                      self._format_prohibition_reason(Planet.SUN, other, aspect, timing, timing, chart))
            events.append(PerfectionEvent(
                event_type=EventType.COMBUSTION_VETO,
                primary_pair=(querent, quesited),
                mediator=Planet.SUN,
                aspect=aspect,
                exact_in_days=timing,
                favorable=False,
                reason=reason,
                challenges=["combustion"]
            ))
            return events

        # Determine favorability and confidence for the chosen aspect
        favorable, challenges, quality_tags = self._assess_direct_aspect_quality(
            aspect, reception_data, chart, querent, quesited
        )
        event_type = EventType.DIRECT_PENALIZED if challenges else EventType.DIRECT
        confidence = self._calculate_direct_confidence(aspect, reception_data, challenges)

        events.append(PerfectionEvent(
            event_type=event_type,
            primary_pair=(querent, quesited),
            aspect=aspect,
            reception_data=reception_data,
            exact_in_days=timing,
            favorable=favorable,
            confidence=confidence,
            reason=f"{aspect.display_name} between significators",
            challenges=challenges,
            quality_tags=quality_tags
        ))
        
        return events
    
    def _detect_translation_events(self, chart: HoraryChart, querent: Planet, quesited: Planet, 
                                 window_days: int) -> List[PerfectionEvent]:
        """Detect translation of light events with strict rules"""
        print(f"   TRANSLATION DEBUG:")
        events = []
        if querent == quesited:
            print(f"     Skipped: Same significators")
            return events
        
        for translator in [Planet.MOON, Planet.MERCURY, Planet.VENUS, Planet.MARS, Planet.JUPITER, Planet.SATURN]:
            print(f"     Checking translator: {translator.value}")
            if translator in (querent, quesited):
                print(f"       Skipped: Translator is one of the significators")
                continue
                
            # STRICT TRANSLATION RULE: Must separate from one and apply to other
            sep_event = self._find_separating_aspect(chart, translator, querent, window_days)
            app_event = self._find_applying_aspect(chart, translator, quesited, window_days)
            
            if not sep_event or not app_event:
                # Try reverse direction
                sep_event = self._find_separating_aspect(chart, translator, quesited, window_days)
                app_event = self._find_applying_aspect(chart, translator, querent, window_days)
                
            if sep_event and app_event:
                # Ensure proper sequence (separation before application)
                if sep_event['timing'] < app_event['timing']:
                    
                    # Classical speed rule: translator must be faster than BOTH significators
                    tr_pos = chart.planets.get(translator)
                    q_pos = chart.planets.get(querent)
                    qe_pos = chart.planets.get(quesited)
                    tr_sp = abs(self._get_daily_motion(tr_pos))
                    q_sp = abs(self._get_daily_motion(q_pos))
                    qe_sp = abs(self._get_daily_motion(qe_pos))
                    if getattr(self.config.translation, "require_speed_advantage", True):
                        if not (tr_sp > q_sp and tr_sp > qe_sp):
                            continue
                    
                    # --- NEW: recency bound for the separation leg (avoid stale separations) ---
                    max_lookback = getattr(self.config, "translation_max_lookback_days", 7)
                    if (-sep_event['timing']) > float(max_lookback):
                        # Separation too far in the past to plausibly "carry light"
                        continue

                    # --- NEW: the mediator's NEXT application must be to the intended receiver ---
                    # If the mediator applies to anyone else first, no translation.
                    receiver = app_event.get('target', quesited)
                    earliest_next = self._find_earliest_application(
                        chart, translator, window_days, exclude={sep_event['target']}
                    )
                    if (not earliest_next or
                        earliest_next['target'] != receiver or
                        abs(earliest_next['timing'] - app_event['timing']) > EPS):
                        continue

                    # Abscission guard: someone else perfects with the receiver before the second leg
                    t_complete = app_event['timing']
                    abscission_found = False
                    
                    for other in [Planet.SUN, Planet.MOON, Planet.MERCURY, Planet.VENUS, Planet.MARS, Planet.JUPITER, Planet.SATURN]:
                        if other in (translator, querent, quesited):
                            continue
                        other_app = self._find_applying_aspect(chart, other, receiver, window_days)
                        if other_app and 0 < other_app['timing'] < t_complete:
                            # Emit ABSCISSION denial instead of translation
                            events.append(PerfectionEvent(
                                event_type=EventType.ABSCISSION,
                                primary_pair=(querent, quesited),
                                aspect=other_app['aspect'],
                                mediator=other,
                                exact_in_days=other_app['timing'],
                                favorable=False,
                                confidence=getattr(self.config.confidence.denial, "abscission", 70),
                                reason=f"Abscission: {other.value} perfects with {receiver.value} before translation by {translator.value} completes",
                                metadata={'receiver': receiver, 'interceptor': other, 'abscises_translator': translator}
                            ))
                            abscission_found = True
                            break
                    
                    # Only add translation if no abscission found
                    if not abscission_found:
                        reception_data = self._get_cached_reception(chart, querent, quesited)
                        # Per-leg receptions
                        recept_sep = self._get_cached_reception(chart, translator, sep_event['target'])
                        recept_app = self._get_cached_reception(chart, translator, app_event['target'])
                        hard_second_leg = app_event['aspect'] in [Aspect.SQUARE, Aspect.OPPOSITION]
                        anti_sep = (recept_sep.get('type') == 'detriment_or_fall_against_translator')

                        favorable = True
                        challenges: List[str] = []
                        quality_tags: List[str] = ["translation"]
                        if hard_second_leg and not recept_app.get('mutual') and not recept_app.get('one_way'):
                            favorable = False
                            challenges.append("hard_second_leg_no_reception")
                            quality_tags.append("hostile")
                        if anti_sep:
                            challenges.append("anti_reception_first_leg")

                        confidence = self.config.confidence.perfection.translation_of_light
                        if not favorable:
                            confidence = max(confidence - 20, 20)

                        events.append(PerfectionEvent(
                            event_type=EventType.TRANSLATION,
                            primary_pair=(querent, quesited),
                            mediator=translator,
                            exact_in_days=app_event['timing'],
                            favorable=favorable,
                            confidence=confidence,
                            reason=f"Translation by {translator.value}",
                            reception_data=reception_data,
                            challenges=challenges,
                            quality_tags=quality_tags,
                            metadata={'separation': sep_event, 'application': app_event}
                        ))
        
        return events

    def _find_earliest_application(
        self,
        chart: HoraryChart,
        planet: Planet,
        window_days: int,
        exclude: Set[Planet] | None = None
    ) -> Optional[Dict]:
        """
        Find the very next (earliest) applying aspect from `planet` to any classical planet,
        optionally excluding some targets. Used to ensure a translator applies to the intended
        receiver before making any other perfection (no intervening aspects).
        """
        exclude = exclude or set()
        best: Optional[Dict] = None
        for other in [Planet.SUN, Planet.MOON, Planet.MERCURY, Planet.VENUS, Planet.MARS, Planet.JUPITER, Planet.SATURN]:
            if other == planet or other in exclude:
                continue
            cand = self._find_applying_aspect(chart, planet, other, window_days)
            if cand and (best is None or cand['timing'] < best['timing']):
                best = {'target': other, 'aspect': cand['aspect'], 'timing': cand['timing']}
        return best

    def precompute_receptions(self, chart: HoraryChart) -> None:
        """Precompute reception data for all classical planet pairs into local cache."""
        classical = [Planet.SUN, Planet.MOON, Planet.MERCURY, Planet.VENUS, Planet.MARS, Planet.JUPITER, Planet.SATURN]
        for i, a in enumerate(classical):
            for b in classical[i:]:
                if a == b:
                    self.reception_cache[f"{a.value}:{b.value}"] = {
                        "type": "identity",
                        "mutual": "identity",
                        "one_way": [],
                    }
                    continue
                try:
                    calc = TraditionalReceptionCalculator()
                    rec_ab = calc.calculate_comprehensive_reception(chart, a, b)
                    rec_ba = calc.calculate_comprehensive_reception(chart, b, a)
                    self.reception_cache[f"{a.value}:{b.value}"] = rec_ab
                    self.reception_cache[f"{b.value}:{a.value}"] = rec_ba
                except Exception:
                    continue
    
    def _detect_collection_events(self, chart: HoraryChart, querent: Planet, quesited: Planet,
                                window_days: int) -> List[PerfectionEvent]:
        """Detect collection of light events with strict collector rules"""
        events = []
        if querent == quesited:
            return events
        
        for collector in [Planet.SUN, Planet.MOON, Planet.MERCURY, Planet.VENUS, Planet.MARS, Planet.JUPITER, Planet.SATURN]:
            if collector in (querent, quesited):
                continue
                
            # STRICT COLLECTOR RULE: Must be slower than both significators
            if not self._is_valid_collector(chart, collector, querent, quesited):
                continue
                
            # Both significators must apply to collector
            querent_app = self._find_applying_aspect(chart, querent, collector, window_days)
            quesited_app = self._find_applying_aspect(chart, quesited, collector, window_days)
            
            if querent_app and quesited_app:
                # Collection time is when the later application completes
                collection_time = max(querent_app['timing'], quesited_app['timing'])
                
                # Abscission guard: any third party perfects with the collector before completion
                abscission_found = False
                for other in [Planet.SUN, Planet.MOON, Planet.MERCURY, Planet.VENUS, Planet.MARS, Planet.JUPITER, Planet.SATURN]:
                    if other in (collector, querent, quesited):
                        continue
                    other_app = self._find_applying_aspect(chart, other, collector, window_days)
                    if other_app and 0 < other_app['timing'] < (collection_time - EPS):
                        events.append(PerfectionEvent(
                            event_type=EventType.ABSCISSION,
                            primary_pair=(querent, quesited),
                            aspect=other_app['aspect'],
                            mediator=other,
                            exact_in_days=other_app['timing'],
                            favorable=False,
                            confidence=getattr(self.config.confidence.denial, "abscission", 70),
                            reason=f"Abscission: {other.value} perfects with {collector.value} before collection completes",
                            metadata={'collector': collector, 'interceptor': other}
                        ))
                        abscission_found = True
                        break
                
                # Only add collection if no abscission found
                if not abscission_found:
                    # Next-application for each must be to collector
                    qa_next = self._find_earliest_application(chart, querent, window_days, exclude=set())
                    qe_next = self._find_earliest_application(chart, quesited, window_days, exclude=set())
                    if not (qa_next and qa_next['target'] == collector and qe_next and qe_next['target'] == collector):
                        continue

                    reception_data = self._get_cached_reception(chart, querent, quesited)
                    rec_q = self._get_cached_reception(chart, collector, querent)
                    rec_e = self._get_cached_reception(chart, collector, quesited)
                    both_received = bool(rec_q.get('one_way')) and bool(rec_e.get('one_way'))
                    favorable = bool(both_received)
                    confidence = self.config.confidence.perfection.collection_of_light
                    if not favorable:
                        confidence = max(confidence - 15, 25)
                    challenges = [] if favorable else ["weak_reception_to_collector"]

                    events.append(PerfectionEvent(
                        event_type=EventType.COLLECTION,
                        primary_pair=(querent, quesited), 
                        mediator=collector,
                        exact_in_days=collection_time,
                        favorable=favorable,
                        confidence=confidence,
                        reason=f"Collection by {collector.value}",
                        reception_data=reception_data,
                        challenges=challenges,
                        metadata={
                            'querent_application': querent_app,
                            'quesited_application': quesited_app
                        }
                    ))
        
        return events
    
    # --- helpers for richer wording -------------------------------------------------
    def _ordinal(self, n: int) -> str:
        # simple ordinal helper (1st, 2nd, 3rd, 4th…)
        if 10 <= (n % 100) <= 20:
            return f"{n}th"
        suffix_map = {1: 'st', 2: 'nd', 3: 'rd'}
        return f"{n}{suffix_map.get(n % 10, 'th')}"
    
    def _get_cusps(self, chart: HoraryChart) -> List[float]:
        """Extract house cusps from chart, handling various formats"""
        cusps = []
        
        # Try different possible attributes/formats for house cusps
        if hasattr(chart, 'houses') and chart.houses:
            if isinstance(chart.houses, dict):
                # Houses as dict with cusp info
                for i in range(1, 13):
                    house_data = chart.houses.get(i) or chart.houses.get(str(i))
                    if house_data and hasattr(house_data, 'cusp'):
                        cusps.append(house_data.cusp)
                    elif isinstance(house_data, dict) and 'cusp' in house_data:
                        cusps.append(house_data['cusp'])
            elif isinstance(chart.houses, list) and len(chart.houses) >= 12:
                # Houses as list of cusps
                cusps = chart.houses[:12]
        
        # Try chart.cusps attribute
        if not cusps and hasattr(chart, 'cusps') and chart.cusps:
            if isinstance(chart.cusps, list) and len(chart.cusps) >= 12:
                cusps = chart.cusps[:12]
        
        # Default fallback: equal house system starting at 0°
        if not cusps:
            cusps = [i * 30.0 for i in range(12)]
        
        return cusps
    
    def _arc_contains(self, start: float, end: float, point: float) -> bool:
        """Check if point is within arc from start to end, handling 0°/360° wrap"""
        # Normalize all values to [0, 360)
        start = start % 360
        end = end % 360
        point = point % 360
        
        if start <= end:
            # Normal case: no wrap
            return start <= point < end
        else:
            # Wrap case: arc crosses 0°
            return point >= start or point < end
    
    def _house_of_longitude(self, longitude: float, cusps: List[float]) -> int:
        """Determine which house a longitude falls in"""
        if not cusps or len(cusps) < 12:
            return 1  # Default fallback
        
        longitude = longitude % 360
        
        for i in range(12):
            start_cusp = cusps[i]
            end_cusp = cusps[(i + 1) % 12]
            
            if self._arc_contains(start_cusp, end_cusp, longitude):
                return i + 1
        
        return 1  # Fallback
    
    def _house_at_future_time(self, chart: HoraryChart, planet: Planet, future_days: float) -> Optional[int]:
        """Compute which house a planet will be in at a future time"""
        try:
            cusps = self._get_cusps(chart)
            if not cusps:
                return None
            
            # Get current planet position
            planet_pos = chart.planets.get(planet)
            if not planet_pos:
                return None
            
            current_lon = getattr(planet_pos, 'longitude', None)
            if current_lon is None:
                return None
            
            # Get daily motion
            daily_motion = self._get_daily_motion(planet_pos)
            
            # Compute future longitude
            future_lon = (current_lon + daily_motion * future_days) % 360
            
            # Determine house
            return self._house_of_longitude(future_lon, cusps)
        
        except Exception:
            # On any error, return None - don't crash prohibition detection
            return None

    def _format_prohibition_reason(
        self,
        prohibitor: Planet,
        target: Planet,
        aspect,
        timing_days: float,
        direct_time_days: Optional[float],
        chart: HoraryChart,
    ) -> str:
        malefics = {Planet.MARS, Planet.SATURN}
        benefics = {Planet.JUPITER, Planet.VENUS}
        role = "malefic" if prohibitor in malefics else ("benefic" if prohibitor in benefics else "neutral")
        
        # Compute houses at aspect time (future positions), with fallback to current houses
        t_house_future = self._house_at_future_time(chart, target, timing_days)
        p_house_future = self._house_at_future_time(chart, prohibitor, timing_days)
        
        # Fallback to current houses if future computation fails
        t_pos = chart.planets.get(target)
        p_pos = chart.planets.get(prohibitor)
        t_house = t_house_future if t_house_future is not None else getattr(t_pos, "house", None)
        p_house = p_house_future if p_house_future is not None else getattr(p_pos, "house", None)
        
        rec = self._get_cached_reception(chart, prohibitor, target)
        rec_type = (rec or {}).get("type", "none")
        rec_phrase = f" with reception ({rec_type})" if rec_type and rec_type != "none" else ""
        preempt = f", pre-empting the significators' perfection (~{direct_time_days:.1f}d)" if direct_time_days is not None else ""
        
        # Use "at aspect time" to clarify these are future houses
        time_qualifier = " (at aspect time)" if (t_house_future is not None or p_house_future is not None) else ""
        loc_target = f" in the {self._ordinal(t_house)} house{time_qualifier}" if t_house else ""
        loc_prohib = f" from the {self._ordinal(p_house)} house{time_qualifier}" if p_house else ""
        
        return (
            f"Prohibition: {prohibitor.value} ({role}) applies {aspect.display_name.lower()} to "
            f"{target.value}{loc_target}{loc_prohib} in {timing_days:.1f} days{preempt}{rec_phrase}."
        )

    def _detect_prohibition_events(self, chart: HoraryChart, querent: Planet, quesited: Planet,
                                   window_days: int, earliest_positive_time: Optional[float] = None) -> List[PerfectionEvent]:
        """Classical prohibition: faster third reaches the RECEIVER earlier than the earliest positive route.
        Requires a genuine applying direct route (within window & sign guard enforced upstream).
        """
        events: List[PerfectionEvent] = []

        # Genuine applying direct route (either direction)
        app_q_to_e = self._find_applying_aspect(chart, querent, quesited, window_days)
        app_e_to_q = self._find_applying_aspect(chart, quesited, querent, window_days)
        if not app_q_to_e and not app_e_to_q:
            return events
        if app_q_to_e and (not app_e_to_q or app_q_to_e['timing'] <= app_e_to_q['timing']):
            applier, receiver, t_direct = querent, quesited, app_q_to_e['timing']
        else:
            applier, receiver, t_direct = quesited, querent, app_e_to_q['timing']

        # Pre-empt the earliest positive route (if computed by caller)
        threshold = t_direct
        if earliest_positive_time is not None and earliest_positive_time < threshold:
            threshold = earliest_positive_time

        # Third planet must reach RECEIVER earlier than threshold; faster than receiver; not an immediate TAL chain
        for p in [Planet.SUN, Planet.MOON, Planet.MERCURY, Planet.VENUS, Planet.MARS, Planet.JUPITER, Planet.SATURN]:
            if p in (querent, quesited):
                continue
            app = self._find_applying_aspect(chart, p, receiver, window_days)
            if not app or not (0 < app['timing'] < threshold - EPS):
                continue
            if abs(self._get_daily_motion(chart.planets.get(p))) <= abs(self._get_daily_motion(chart.planets.get(receiver))):
                continue
            nxt = self._find_earliest_application(chart, p, window_days, exclude={receiver})
            if nxt and abs(nxt['timing'] - app['timing']) <= EPS and nxt['target'] == applier:
                continue

            reason = self._format_prohibition_reason(p, receiver, app['aspect'], app['timing'], t_direct, chart)
            events.append(PerfectionEvent(
                event_type=EventType.PROHIBITION,
                primary_pair=(querent, quesited),
                mediator=p,
                aspect=app['aspect'],
                exact_in_days=app['timing'],
                favorable=False,
                reason=reason,
                metadata={'target': receiver, 'preempts_in_days': threshold}
            ))
        return events
    
    def _detect_denial_events(self, chart: HoraryChart, querent: Planet, quesited: Planet,
                            window_days: int) -> List[PerfectionEvent]:
        """Detect denial events (abscission, refranation, frustration)"""
        events = []
        
        # Check for refranation (planet turns retrograde before perfection)
        for aspect in [Aspect.CONJUNCTION, Aspect.SEXTILE, Aspect.SQUARE, Aspect.TRINE, Aspect.OPPOSITION]:
            timing = self.timing.when_exact_in_days(querent, quesited, aspect, chart)
            if timing:
                # Check if either planet stations retrograde before perfection
                querent_pos = chart.planets[querent]
                quesited_pos = chart.planets[quesited]
                
                if (self._get_daily_motion(querent_pos) > 0 and 
                    self._will_station_before(chart, querent, timing)):
                    events.append(PerfectionEvent(
                        event_type=EventType.REFRANATION,
                        primary_pair=(querent, quesited),
                        aspect=aspect,
                        exact_in_days=timing,
                        favorable=False,
                        confidence=self.config.confidence.denial.refranation,
                        reason=f"Refranation: {querent.value} turns retrograde before {aspect.display_name}",
                        metadata={'refraning_planet': querent}
                    ))
                
                if (self._get_daily_motion(quesited_pos) > 0 and 
                    self._will_station_before(chart, quesited, timing)):
                    events.append(PerfectionEvent(
                        event_type=EventType.REFRANATION,
                        primary_pair=(querent, quesited),
                        aspect=aspect,
                        exact_in_days=timing,
                        favorable=False,
                        confidence=self.config.confidence.denial.refranation,
                        reason=f"Refranation: {quesited.value} turns retrograde before {aspect.display_name}",
                        metadata={'refraning_planet': quesited}
                    ))
        
        # Add abscission and frustration
        events.extend(self._detect_abscission_events(chart, querent, quesited, window_days))
        events.extend(self._detect_frustration_events(chart, querent, quesited, window_days))
        return events

    def _detect_abscission_events(self, chart: HoraryChart, querent: Planet, quesited: Planet, window_days: int) -> List[PerfectionEvent]:
        events: List[PerfectionEvent] = []
        route = self._current_direct_route(chart, querent, quesited, window_days)
        if not route:
            return events
        applier, receiver = route['applier'], route['receiver']
        t_direct = route['timing']

        for p in [Planet.SUN, Planet.MOON, Planet.MERCURY, Planet.VENUS, Planet.MARS, Planet.JUPITER, Planet.SATURN]:
            if p in (querent, quesited):
                continue
            app = self._find_applying_aspect(chart, p, applier, window_days)
            if not app or not (0 < app['timing'] < t_direct - EPS):
                continue
            if abs(self._get_daily_motion(chart.planets.get(p))) <= abs(self._get_daily_motion(chart.planets.get(applier))):
                continue
            nxt = self._find_earliest_application(chart, p, window_days, exclude={applier})
            if nxt and abs(nxt['timing'] - app['timing']) <= EPS and nxt['target'] == receiver:
                continue
            events.append(PerfectionEvent(
                event_type=EventType.ABSCISSION,
                primary_pair=(querent, quesited),
                mediator=p,
                aspect=app['aspect'],
                exact_in_days=app['timing'],
                favorable=False,
                confidence=getattr(self.config.confidence.denial, "abscission", 70),
                reason=f"Abscission: {p.value} takes light from {applier.value} before it reaches {receiver.value}",
                metadata={'applier': applier, 'receiver': receiver, 'interceptor': p}
            ))
        return events

    def _detect_frustration_events(self, chart: HoraryChart, querent: Planet, quesited: Planet, window_days: int) -> List[PerfectionEvent]:
        events: List[PerfectionEvent] = []
        route = self._current_direct_route(chart, querent, quesited, window_days)
        if not route:
            return events
        applier, receiver = route['applier'], route['receiver']
        t_direct = route['timing']

        nxt = self._find_earliest_application(chart, applier, window_days, exclude=set())
        if not nxt or nxt['target'] == receiver or nxt['timing'] >= t_direct - EPS:
            return events
        chain = self._find_applying_aspect(chart, nxt['target'], receiver, window_days)
        if chain and 0 < chain['timing'] <= nxt['timing'] + EPS:
            return events
        events.append(PerfectionEvent(
            event_type=EventType.FRUSTRATION,
            primary_pair=(querent, quesited),
            mediator=nxt['target'],
            aspect=nxt['aspect'],
            exact_in_days=nxt['timing'],
            favorable=False,
            confidence=getattr(self.config.confidence.denial, "frustration", 65),
            reason=f"Frustration: applier {applier.value} perfects with {nxt['target'].value} before reaching {receiver.value}",
            metadata={'applier': applier, 'receiver': receiver}
        ))
        return events
    
    def _detect_house_placement_events(self, chart: HoraryChart, querent: Planet, quesited: Planet) -> List[PerfectionEvent]:
        """Detect house placement perfections"""
        events = []
        
        # Get querent and quesited significators
        try:
            sigs = chart.get("significators", {})  # Assuming this exists on chart
            if not sigs:
                return events
                
            querent_house = sigs.get("querent_house", 1)  
            quesited_house = sigs.get("quesited_house", 7)
            
            # Check if querent is in quesited's house
            querent_pos = chart.planets.get(querent)
            if querent_pos and hasattr(querent_pos, 'house') and querent_pos.house == quesited_house:
                events.append(PerfectionEvent(
                    event_type=EventType.HOUSE_PLACEMENT,
                    primary_pair=(querent, quesited),
                    exact_in_days=0.0,  # Immediate
                    favorable=True,
                    confidence=75,
                    reason=f"{querent.value} placed in {quesited_house}th house (quesited's house)",
                    metadata={'placement_type': 'querent_in_quesited_house'}
                ))
            
            # Check if quesited is in querent's house
            quesited_pos = chart.planets.get(quesited)
            if quesited_pos and hasattr(quesited_pos, 'house') and quesited_pos.house == querent_house:
                events.append(PerfectionEvent(
                    event_type=EventType.HOUSE_PLACEMENT,
                    primary_pair=(querent, quesited),
                    exact_in_days=0.0,  # Immediate
                    favorable=True,
                    confidence=75,
                    reason=f"{quesited.value} placed in {querent_house}st house (querent's house)",
                    metadata={'placement_type': 'quesited_in_querent_house'}
                ))
                
        except (AttributeError, KeyError):
            # If chart doesn't have expected structure, skip house placement detection
            pass
        
        return events
    
    # Helper methods
    
    def _get_cached_reception(self, chart: HoraryChart, planet1: Planet, planet2: Planet) -> Dict:
        """Get reception data with caching"""
        cache_key = f"{planet1.value}:{planet2.value}"
        if cache_key not in self.reception_cache:
            if planet1 == planet2:
                # Identity: treat as unity, not 'mutual reception'
                self.reception_cache[cache_key] = {
                    "type": "identity",
                    "mutual": "identity",
                    "one_way": [],
                }
            else:
                reception_calc = TraditionalReceptionCalculator()
                self.reception_cache[cache_key] = reception_calc.calculate_comprehensive_reception(
                    chart, planet1, planet2
                )
        return self.reception_cache[cache_key]
    
    def _is_combustion_conjunction(self, chart: HoraryChart, planet1: Planet, planet2: Planet) -> bool:
        """Check if conjunction involves combustion with Sun"""
        if Planet.SUN not in (planet1, planet2):
            return False
            
        other_planet = planet2 if planet1 == Planet.SUN else planet1
        other_pos = chart.planets[other_planet]
        
        return hasattr(other_pos, 'solar_condition') and other_pos.solar_condition.condition == SolarCondition.COMBUSTION
    
    def _assess_direct_aspect_quality(self, aspect: Aspect, reception_data: Dict, 
                                    chart: HoraryChart, querent: Planet, quesited: Planet) -> Tuple[bool, List[str], List[str]]:
        """Assess the quality and challenges of a direct aspect"""
        challenges = []
        quality_tags = []
        
        # Hard aspects create challenges
        if aspect in [Aspect.SQUARE, Aspect.OPPOSITION]:
            challenges.append("hard_aspect")
            quality_tags.append("with difficulty")
        else:
            quality_tags.append("easier")
            
        # Check for cadent significators
        querent_pos = chart.planets[querent]
        quesited_pos = chart.planets[quesited]
        
        if hasattr(querent_pos, 'house') and querent_pos.house in [3, 6, 9, 12]:
            challenges.append("cadent_querent")
        if hasattr(quesited_pos, 'house') and quesited_pos.house in [3, 6, 9, 12]:
            challenges.append("cadent_quesited")
            
        # Reception can mitigate challenges
        mutual = reception_data.get("mutual", "none")
        if mutual == "identity":
            return True, [], ["identity/union"]
        elif mutual in ["mutual_rulership", "mutual_exaltation"]:
            # Strong reception mitigates all challenges
            if "hard_aspect" in challenges:
                challenges.remove("hard_aspect")
                quality_tags = ["easier"]
        elif mutual == "mixed_reception":
            # Mixed reception partially mitigates
            quality_tags.append("mitigated by reception")
            
        # Overall favorability
        favorable = len(challenges) == 0 or mutual in ["mutual_rulership", "mutual_exaltation"]
        
        return favorable, challenges, quality_tags
    
    def _calculate_direct_confidence(self, aspect: Aspect, reception_data: Dict, challenges: List[str]) -> int:
        """Calculate confidence for direct perfection"""
        base_confidence = self.config.confidence.perfection.direct_basic
        
        # Apply penalties for challenges
        if "hard_aspect" in challenges:
            if aspect == Aspect.SQUARE:
                penalty = getattr(self.config.confidence.perfection, "hard_square_penalty", 15)
            else:  # Opposition
                penalty = getattr(self.config.confidence.perfection, "hard_opposition_penalty", 20)
            base_confidence = max(base_confidence - penalty, 10)
        
        # Apply reception bonuses
        mutual = reception_data.get("mutual", "none")
        if mutual == "mutual_rulership":
            bonus = getattr(self.config.confidence.reception, "mutual_rulership_bonus", 15)
            base_confidence = min(base_confidence + bonus, 100)
        elif mutual == "mutual_exaltation":
            bonus = getattr(self.config.confidence.reception, "mutual_exaltation_bonus", 10)
            base_confidence = min(base_confidence + bonus, 100)
            
        return int(base_confidence)
    
    def _find_applying_aspect(self, chart: HoraryChart, planet1: Planet, planet2: Planet, 
                            window_days: int) -> Optional[Dict]:
        """Find earliest applying aspect between two planets within window"""
        best = None
        for aspect in [Aspect.CONJUNCTION, Aspect.SEXTILE, Aspect.SQUARE, Aspect.TRINE, Aspect.OPPOSITION]:
            timing = self.timing.when_exact_in_days(planet1, planet2, aspect, chart)
            if timing and 0 < timing <= window_days:
                if (best is None) or (timing < best['timing']):
                    best = {
                        'aspect': aspect,
                        'timing': float(timing),
                        'applying': True,
                        'target': planet2
                    }
        return best
    
    def _find_separating_aspect(self, chart: HoraryChart, planet1: Planet, planet2: Planet,
                              window_days: int) -> Optional[Dict]:
        """Find a *recent* separating aspect between planet1 and planet2 within `window_days`.
        Uses the same analytic kernel as `when_exact_in_days` but solves for the last hit in the past.
        """
        pos1 = chart.planets.get(planet1)
        pos2 = chart.planets.get(planet2)
        if not pos1 or not pos2:
            return None

        delta = (getattr(pos2, 'longitude', 0.0) - getattr(pos1, 'longitude', 0.0)) % 360.0
        v_rel = self._get_daily_motion(pos2) - self._get_daily_motion(pos1)
        if abs(v_rel) < 1e-6:
            return None

        best = None
        for aspect in [Aspect.CONJUNCTION, Aspect.SEXTILE, Aspect.SQUARE, Aspect.TRINE, Aspect.OPPOSITION]:
            A = getattr(aspect, 'degrees', None)
            if A is None:
                continue

            # Consider symmetric targets for non-axial aspects and opposition
            if A == 0:
                targets = [0.0]
            elif A == 180:
                targets = [180.0, -180.0]
            else:
                targets = [float(A), -float(A)]

            # Compute time since last occurrence among equivalent targets; choose smallest look-back
            for target in targets:
                if v_rel > 0:
                    dt = ((delta - target) % 360.0) / v_rel
                else:
                    dt = ((target - delta) % 360.0) / (-v_rel)

                if 0.0 < dt <= float(window_days):
                    cand = {'aspect': aspect, 'timing': -float(dt), 'separating': True, 'target': planet2}
                    if (best is None) or (dt < -best['timing']):  # smallest look-back
                        best = cand

        return best
    
    def _is_valid_collector(self, chart: HoraryChart, collector: Planet, sig1: Planet, sig2: Planet) -> bool:
        """Check if planet qualifies as a valid collector (slower than both significators)"""
        collector_pos = chart.planets[collector]
        sig1_pos = chart.planets[sig1] 
        sig2_pos = chart.planets[sig2]
        
        collector_speed = abs(self._get_daily_motion(collector_pos))
        sig1_speed = abs(self._get_daily_motion(sig1_pos))
        sig2_speed = abs(self._get_daily_motion(sig2_pos))
        
        return collector_speed < min(sig1_speed, sig2_speed)
    
    def _will_station_before(self, chart: HoraryChart, planet: Planet, days: float) -> bool:
        """Check if planet will station retrograde before the given time"""
        pos = chart.planets.get(planet)
        if not pos:
            return False
            
        current_speed = self._get_daily_motion(pos)
        
        # Only check for direct planets that might turn retrograde
        if current_speed <= 0:
            return False
            
        # Simplified station detection: check if speed is very slow (near station)
        # and planet is one that commonly stations (Mercury, Venus, Mars, Jupiter, Saturn)
        stationing_planets = {Planet.MERCURY, Planet.VENUS, Planet.MARS, Planet.JUPITER, Planet.SATURN}
        if planet not in stationing_planets:
            return False
            
        # If speed is very slow (< 0.1 deg/day) consider it near station
        if abs(current_speed) < 0.1:
            return True
            
        # More sophisticated check would use ephemeris data
        # For now, we conservatively detect only very slow-moving planets
        return False
    
    def _deduplicate_events(self, events: List[PerfectionEvent]) -> List[PerfectionEvent]:
        """Remove duplicate events using stable keys"""
        seen_keys = set()
        unique_events = []
        
        for event in events:
            if event.event_key not in seen_keys:
                seen_keys.add(event.event_key)
                unique_events.append(event)
            else:
                # If duplicate, keep the one with more metadata (enhanced version)
                for i, existing in enumerate(unique_events):
                    if existing.event_key == event.event_key:
                        if len(event.metadata) > len(existing.metadata):
                            unique_events[i] = event
                        break
        
        return unique_events
    
    
    def _deconflict_same_time(self, events: List[PerfectionEvent], eps: float = EPS) -> List[PerfectionEvent]:
        """
        Suppress denial/prohibition events that coincide (within eps) with a positive route
        to reduce contradictory/noisy logs.
        """
        positives = [e for e in events if e.event_type in {
            EventType.DIRECT, EventType.DIRECT_PENALIZED, EventType.TRANSLATION, EventType.COLLECTION
        } and e.exact_in_days is not None]
        def coincides_with_positive(e):
            if e.exact_in_days is None:
                return False
            for p in positives:
                if abs((p.exact_in_days or 0) - e.exact_in_days) <= eps:
                    return True
            return False
        filtered = []
        for e in events:
            if e.event_type in {EventType.PROHIBITION, EventType.ABSCISSION, EventType.REFRANATION, EventType.FRUSTRATION}:
                if coincides_with_positive(e):
                    continue
            filtered.append(e)
        return filtered

    def _sort_events_by_priority(self, events: List[PerfectionEvent]) -> List[PerfectionEvent]:
        """Sort events by timing and quality for deterministic selection"""
        def sort_key(event):
            # Primary sort: timing (earlier first)
            timing = event.exact_in_days or float('inf')
            
            # Secondary sort: event type priority (early positives > classical denials)
            type_priority = {
                EventType.DIRECT: 0,
                EventType.DIRECT_PENALIZED: 1,
                EventType.TRANSLATION: 2,
                EventType.COLLECTION: 3,
                EventType.PROHIBITION: 4,
                EventType.COMBUSTION_VETO: 5,
                EventType.HOUSE_PLACEMENT: 6,
                EventType.REFRANATION: 7,
                EventType.FRUSTRATION: 8,
                EventType.ABSCISSION: 9
            }.get(event.event_type, 9)
            
            # Tertiary sort: quality (fewer challenges first)
            challenge_count = len(event.challenges)
            
            return (timing, type_priority, challenge_count)
        
        return sorted(events, key=sort_key)


class PerfectionChooser:
    """Selects primary and secondary perfections from detected events"""
    
    def __init__(self):
        self.config = cfg()
    
    def select_primary_perfection(self, events: List[PerfectionEvent]) -> Optional[PerfectionEvent]:
        """
        Select the primary perfection honoring chronology:
        - A prohibition only pre-empts if it occurs *earlier* than any positive route;
        - Otherwise pick the earliest positive (direct/translation/collection),
          then fall back to earliest denial (refranation/frustration/abscission),
          else earliest event.
        """
        if not events:
            return None

        # Partition by families
        positives = [e for e in events if e.event_type in {
            EventType.DIRECT, EventType.DIRECT_PENALIZED,
            EventType.TRANSLATION, EventType.COLLECTION
        }]
        prohibitions = [e for e in events if e.event_type == EventType.PROHIBITION]
        denials = [e for e in events if e.event_type in {
            EventType.REFRANATION, EventType.FRUSTRATION, EventType.ABSCISSION
        }]

        # Compute earliest by timing within each bucket
        earliest_pos = min(positives, key=lambda e: (e.exact_in_days is None, e.exact_in_days or float('inf')), default=None)
        earliest_proh = min(prohibitions, key=lambda e: (e.exact_in_days is None, e.exact_in_days or float('inf')), default=None)
        earliest_den = min(denials, key=lambda e: (e.exact_in_days is None, e.exact_in_days or float('inf')), default=None)

        # Pre-emption only if it truly comes first
        if earliest_proh and (not earliest_pos or (earliest_proh.exact_in_days or float('inf')) < (earliest_pos.exact_in_days or float('inf'))):
            return earliest_proh

        if earliest_pos:
            return earliest_pos

        if earliest_den:
            return earliest_den

        # Fallback: earliest overall
        return min(events, key=lambda e: (e.exact_in_days is None, e.exact_in_days or float('inf')))
    
    def select_secondary_perfection(self, events: List[PerfectionEvent], 
                                  primary: PerfectionEvent) -> Optional[PerfectionEvent]:
        """Select secondary perfection if applicable"""
        remaining = [e for e in events if e != primary]
        
        # Only return secondary if it's significantly different from primary
        for event in remaining:
            # avoid same-time (within EPS) and near-duplicates
            if abs((event.exact_in_days or 0) - (primary.exact_in_days or 0)) <= EPS:
                continue
            if (event.event_type != primary.event_type or 
                abs((event.exact_in_days or 0) - (primary.exact_in_days or 0)) > 3):
                return event
                
        return None


class PerfectionCoreAPI:
    """Main API for unified perfection detection"""
    
    def __init__(self):
        self.detector = EventDetector()
        self.chooser = PerfectionChooser()
    
    def find_perfections(self, chart: HoraryChart, querent: Planet, quesited: Planet,
                        window_days: int = 30) -> Dict[str, Any]:
        """
        Main API method that returns perfection analysis results.
        
        Returns:
            Dictionary with primary/secondary perfections and event timeline
        """
        print(f"\n=== PERFECTION ANALYSIS DEBUG ===")
        print(f"Querent: {querent.value}")
        print(f"Quesited: {quesited.value}")
        print(f"Window: {window_days} days")
        
        # Show planet positions
        q_pos = chart.planets.get(querent)
        qe_pos = chart.planets.get(quesited)
        if q_pos and qe_pos:
            print(f"Querent position: {getattr(q_pos, 'longitude', 'N/A'):.2f}° (speed: {getattr(q_pos, 'speed', 'N/A'):.4f}°/day)")
            print(f"Quesited position: {getattr(qe_pos, 'longitude', 'N/A'):.2f}° (speed: {getattr(qe_pos, 'speed', 'N/A'):.4f}°/day)")
        
        # Preload receptions in batch for performance (optional heavier path)
        try:
            self.detector.precompute_receptions(chart)
        except Exception:
            pass

        # Detect all events
        all_events = self.detector.detect_all_events(chart, querent, quesited, window_days)
        print(f"\n--- EVENT SELECTION DEBUG ---")
        print(f"Total events detected: {len(all_events)}")
        
        for i, event in enumerate(all_events):
            print(f"  {i+1}. {event.event_type.value.upper()}: {event.reason}")
            print(f"     Timing: {event.exact_in_days:.2f} days" if event.exact_in_days is not None else "     Timing: Immediate")
            if event.mediator:
                print(f"     Mediator: {event.mediator.value}")
            if event.aspect:
                print(f"     Aspect: {event.aspect.display_name}")
            print(f"     Favorable: {event.favorable}, Confidence: {event.confidence}")
        
        # Select primary and secondary
        primary = self.chooser.select_primary_perfection(all_events)
        secondary = self.chooser.select_secondary_perfection(all_events, primary) if primary else None
        
        print(f"\n--- FINAL SELECTION ---")
        if primary:
            print(f"PRIMARY: {primary.event_type.value.upper()} - {primary.reason}")
            print(f"         Timing: {primary.exact_in_days:.2f} days" if primary.exact_in_days is not None else "         Timing: Immediate")
        else:
            print(f"PRIMARY: None selected")
            
        if secondary:
            print(f"SECONDARY: {secondary.event_type.value.upper()} - {secondary.reason}")
            print(f"           Timing: {secondary.exact_in_days:.2f} days" if secondary.exact_in_days is not None else "           Timing: Immediate")
        else:
            print(f"SECONDARY: None selected")
        
        # Convert to engine-compatible format
        # Build simple narrative route summary for consumers
        route_summary = None
        if primary:
            route_summary = {
                'type': primary.event_type.value,
                'mediator': primary.mediator.value if primary.mediator else None,
                'timing_days': primary.exact_in_days,
                'favorable': primary.favorable,
                'confidence': primary.confidence,
                'challenges': primary.challenges,
                'quality_tags': primary.quality_tags,
            }

        result = {
            "events": all_events,
            "primary": self._convert_to_engine_format(primary) if primary else None,
            "secondary": self._convert_to_engine_format(secondary) if secondary else None,
            "timeline": self._create_timeline(all_events),
            "metadata": {
                "total_events": len(all_events),
                "window_days": window_days,
                "detection_method": "unified_core",
                "route_summary": route_summary,
            }
        }
        
        return result
    
    def _convert_to_engine_format(self, event: PerfectionEvent) -> Dict[str, Any]:
        """Convert PerfectionEvent to engine-compatible format"""
        if not event:
            return None
            
        return {
            "perfects": True,
            "type": event.event_type.value,
            "favorable": event.favorable,
            "confidence": event.confidence or 50,
            "reason": event.reason,
            "aspect": event.aspect,
            "reception": event.reception_data,
            "exact_in_days": event.exact_in_days,
            "challenges": event.challenges,
            "quality_tags": event.quality_tags,
            "mediator": event.mediator,
            "metadata": event.metadata,
            "tags": [{"family": "perfection", "kind": event.event_type.value}]
        }
    
    def _create_timeline(self, events: List[PerfectionEvent]) -> List[Dict]:
        """Create timeline view of all events"""
        timeline = []
        for event in events:
            timeline.append({
                "timing": event.exact_in_days,
                "event_type": event.event_type.value,
                "description": event.reason,
                "favorable": event.favorable,
                "mediator": event.mediator.value if event.mediator else None
            })
        return timeline
