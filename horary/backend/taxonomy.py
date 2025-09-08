from __future__ import annotations

import logging
from enum import Enum
from typing import Any, Dict, Optional, List

try:
    from .models import Planet, HoraryChart
except ImportError:  # pragma: no cover - fallback when executed as script
    from models import Planet, HoraryChart

logger = logging.getLogger(__name__)


class Category(str, Enum):
    """Central taxonomy of question categories."""

    GENERAL = "general"
    LOST_OBJECT = "lost_object"
    MARRIAGE = "marriage"
    PREGNANCY = "pregnancy"
    CHILDREN = "children"
    TRAVEL = "travel"
    GAMBLING = "gambling"
    FUNDING = "funding"
    MONEY = "money"
    CAREER = "career"
    HEALTH = "health"
    LAWSUIT = "lawsuit"
    RELATIONSHIP = "relationship"
    EDUCATION = "education"
    PARENT = "parent"
    SIBLING = "sibling"
    FRIEND_ENEMY = "friend_enemy"
    PROPERTY = "property"
    DEATH = "death"
    SPIRITUAL = "spiritual"

    # Possession sub‑categories
    VEHICLE = "vehicle"
    PRECIOUS = "precious"
    TECHNOLOGY = "technology"
    LIVESTOCK = "livestock"
    MARITIME = "maritime"
    
    # Animal sub-category
    PET = "pet"


CATEGORY_DEFAULTS: Dict[Category, Dict[str, Any]] = {
    Category.GENERAL: {"houses": [1, 7], "significators": {}, "natural_significators": {}, "contract": {}},
    Category.LOST_OBJECT: {"houses": [1, 2], "significators": {}, "natural_significators": {}, "contract": {}},
    Category.MARRIAGE: {
        "houses": [1, 7],
        "significators": {"venus": "natural significator of love", "mars": "natural significator of men"},
        "natural_significators": {},
        "contract": {},
    },
    Category.PREGNANCY: {"houses": [1, 5], "significators": {}, "natural_significators": {}, "contract": {}},
    Category.CHILDREN: {"houses": [1, 5], "significators": {}, "natural_significators": {}, "contract": {}},
    Category.TRAVEL: {
        "houses": [1, 3, 6],
        "significators": {"mercury": "short journeys", "jupiter": "long journeys and foreign travel"},
        "natural_significators": {},
        "contract": {},
    },
    Category.GAMBLING: {
        "houses": [1, 5],
        "significators": {
            "jupiter": "natural significator of fortune and luck",
            "venus": "natural significator of pleasure and enjoyment",
        },
        "natural_significators": {},
        "contract": {},
    },
    Category.FUNDING: {
        "houses": [1, 2, 8],
        "significators": {
            "jupiter": "natural significator of abundance and investors",
            "venus": "natural significator of attraction and partnerships",
            "mercury": "natural significator of contracts and negotiations",
        },
        "natural_significators": {},
        "contract": {},
    },
    Category.MONEY: {
        "houses": [1, 2],
        "significators": {"jupiter": "greater fortune", "venus": "lesser fortune"},
        "natural_significators": {
            Category.VEHICLE: Planet.SUN,
            Category.PROPERTY: Planet.MOON,
            Category.PRECIOUS: Planet.VENUS,
            Category.TECHNOLOGY: Planet.MERCURY,
            Category.LIVESTOCK: Planet.MARS,
            Category.MARITIME: Planet.MOON,
        },
        "contract": {},
    },
    Category.CAREER: {
        "houses": [1, 10],
        "significators": {"sun": "honor and reputation", "jupiter": "success"},
        "natural_significators": {},
        "contract": {},
    },
    Category.HEALTH: {
        "houses": [1, 6],
        "significators": {"mars": "fever and inflammation", "saturn": "chronic illness"},
        "natural_significators": {},
        "contract": {},
    },
    Category.LAWSUIT: {"houses": [1, 7], "significators": {}, "natural_significators": {}, "contract": {}},
    Category.RELATIONSHIP: {"houses": [1, 7], "significators": {}, "natural_significators": {}, "contract": {}},
    Category.EDUCATION: {
        "houses": [1, 10, 9],
        "significators": {"mercury": "natural significator of learning and knowledge", "jupiter": "wisdom and higher learning"},
        "natural_significators": {},
        "contract": {"examiner": Planet.SUN},
    },
    Category.PARENT: {"houses": [1, 4], "significators": {}, "natural_significators": {}, "contract": {}},
    Category.SIBLING: {"houses": [1, 3], "significators": {}, "natural_significators": {}, "contract": {}},
    Category.FRIEND_ENEMY: {"houses": [1, 11], "significators": {}, "natural_significators": {}, "contract": {}},
    Category.PROPERTY: {"houses": [1, 4], "significators": {}, "natural_significators": {}, "contract": {}},
    Category.DEATH: {"houses": [1, 8], "significators": {}, "natural_significators": {}, "contract": {}},
    Category.SPIRITUAL: {"houses": [1, 9], "significators": {}, "natural_significators": {}, "contract": {}},
    Category.PET: {
        "houses": [1, 6], 
        "significators": {"moon": "natural significator of small animals"}, 
        "natural_significators": {}, 
        "contract": {}
    },
}


def resolve_category(value: Optional[str | Category]) -> Optional[Category]:
    """Resolve a category value to :class:`Category`.

    Accepts either a :class:`Category` instance or its string value. When a
    legacy string is provided, a deprecation warning is logged.
    """

    if value is None or value == "":
        return None
    if isinstance(value, Category):
        return value
    try:
        cat = Category(value)
    except ValueError as exc:  # pragma: no cover - defensive
        logger.warning("Unknown category '%s'", value)
        raise exc
    logger.warning("Legacy category string '%s' used; prefer Category.%s", value, cat.name)
    return cat


def get_defaults(category: str | Category) -> Dict[str, Any]:
    cat = resolve_category(category)
    return CATEGORY_DEFAULTS.get(cat, {})


def resolve(
    chart: HoraryChart,
    category: Optional[str | Category],
    manual_houses: Optional[List[int]] = None,
    significator_info: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Resolve houses and significators for a question.

    The helper applies precedence of house resolution in the order of
    ``manual_houses`` → taxonomy defaults → ``[1, 7]`` fallback.  It also
    encapsulates special cases that previously lived in the engine such as
    transaction questions and third‑person education queries.
    """

    significator_info = significator_info or {}
    cat = resolve_category(category)

    # Determine houses with proper precedence
    houses = manual_houses
    print(f"\n=== DEBUG: taxonomy.py start ===")
    print(f"manual_houses: {manual_houses}")
    print(f"Initial houses: {houses}")
    
    if not houses:
        defaults = CATEGORY_DEFAULTS.get(cat, {})
        houses = defaults.get("houses")
        print(f"Houses from defaults: {houses}")
    if not houses:
        houses = [1, 7]
        print(f"Houses set to default [1, 7]: {houses}")

    querent_house = houses[0]
    print(f"querent_house: {querent_house}")
    print(f"Final houses array: {houses}")

    if manual_houses:
        quesited_house = manual_houses[1] if len(manual_houses) > 1 else 7
    elif "quesited_house" in significator_info:
        quesited_house = significator_info["quesited_house"]
    else:
        quesited_house = houses[1] if len(houses) > 1 else 7

    querent_ruler = chart.house_rulers.get(querent_house)
    quesited_ruler = chart.house_rulers.get(quesited_house)

    # Transaction questions use natural significators
    if significator_info.get("transaction_type"):
        natural_sigs = significator_info.get("special_significators", {})
        if not querent_ruler or not quesited_ruler:
            return {"valid": False, "reason": "Cannot determine house rulers"}

        item_significator = None
        item_name = None
        for item, planet_name in natural_sigs.items():
            if item not in ("category", "traditional_source"):
                try:
                    item_significator = getattr(Planet, planet_name.upper())
                    item_name = item
                    break
                except AttributeError:
                    continue
        if item_significator:
            return {
                "valid": True,
                "querent": querent_ruler,
                "quesited": quesited_ruler,
                "item_significator": item_significator,
                "item_name": item_name,
                "description": (
                    f"Transaction Setup: Seller: {querent_ruler.value} (L{querent_house}), "
                    f"Buyer: {quesited_ruler.value} (L{quesited_house}), "
                    f"{item_name.title()}: {item_significator.value} (natural significator)"
                ),
                "transaction_type": True,
                "houses": houses,
                "querent_house": querent_house,
                "quesited_house": quesited_house,
            }

    # Third‑person education questions
    if significator_info.get("third_person_education"):
        student_house = significator_info.get("student_house", 7)
        success_house = significator_info.get("success_house", 10)
        student_ruler = chart.house_rulers.get(student_house)
        success_ruler = chart.house_rulers.get(success_house)
        if not (querent_ruler and student_ruler and success_ruler):
            return {
                "valid": False,
                "reason": "Cannot determine house rulers for 3rd person education question",
            }
        return {
            "valid": True,
            "querent": querent_ruler,
            "quesited": success_ruler,
            "student": student_ruler,
            "description": (
                f"Querent: {querent_ruler.value} (ruler of {querent_house}), "
                f"Student: {student_ruler.value} (ruler of {student_house}), "
                f"Success: {success_ruler.value} (ruler of {success_house})"
            ),
            "third_person_education": True,
            "student_significator": student_ruler,
            "success_significator": success_ruler,
            "houses": houses,
            "querent_house": querent_house,
            "quesited_house": success_house,
        }

    if not querent_ruler or not quesited_ruler:
        return {"valid": False, "reason": "Cannot determine house rulers"}

    same_ruler_analysis = None
    if querent_ruler == quesited_ruler:
        same_ruler_analysis = {
            "shared_ruler": querent_ruler,
            "interpretation": "Unity of purpose - same planetary energy governs both querent and matter",
            "traditional_view": "Favorable for agreement and harmony between parties",
            "requires_enhanced_analysis": True,
            # Track which houses share the ruler so downstream logic can
            # reference the original house pair without recomputing
            "houses": [querent_house, quesited_house],
        }

    description = (
        f"Querent: {querent_ruler.value} (ruler of {querent_house}), "
        f"Quesited: {quesited_ruler.value} (ruler of {quesited_house})"
    )
    if same_ruler_analysis:
        print(f"\n=== DEBUG: taxonomy.py Creating shared significator description ===")
        print(f"querent_ruler: {querent_ruler.value}")
        print(f"querent_house: {querent_house}")
        print(f"quesited_house: {quesited_house}")
        print(f"same_ruler_analysis: {same_ruler_analysis}")
        
        description = (
            f"Shared Significator: {querent_ruler.value} rules both houses "
            f"{querent_house} and {quesited_house}"
        )
        print(f"Generated description: {description}")
        print("=== END taxonomy.py DEBUG ===\n")

    return {
        "valid": True,
        "querent": querent_ruler,
        "quesited": quesited_ruler,
        "description": description,
        "same_ruler_analysis": same_ruler_analysis,
        "houses": houses,
        "querent_house": querent_house,
        "quesited_house": quesited_house,
    }
