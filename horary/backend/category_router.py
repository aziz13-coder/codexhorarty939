"""Category router mapping question categories to role contracts."""
from __future__ import annotations

from typing import Dict

try:
    from .models import Planet
    from .taxonomy import Category, get_defaults, resolve_category
except ImportError:  # pragma: no cover - fallback when executed as script
    from models import Planet
    from taxonomy import Category, get_defaults, resolve_category


def get_contract(category: str | Category) -> Dict[str, Planet]:
    """Return role contract for a given category.

    The function accepts either a :class:`Category` enum value or a legacy
    string. Passing a string will emit a deprecation warning via
    :func:`resolve_category`.
    """
    try:
        from .category_rules import get_category_rules
    except ImportError:
        from category_rules import get_category_rules

    cat = resolve_category(category)
    if not cat:
        return {"category_rules": get_category_rules(None)}
    
    defaults = get_defaults(cat)
    contract = defaults.get("contract", {})
    
    # CRITICAL FIX: Include category rules for hierarchical weighting
    contract["category_rules"] = get_category_rules(cat)
    
    return contract
