from __future__ import annotations

"""Category-specific ruleset definitions for scoring.

Each taxonomy.Category can define:

- primary_significators: list of house lords always considered primary
- allowed_turned_houses: mapping of base significator to list of turned houses
- outcome_houses: radical houses whose rulers may affect the outcome
- scored_factors: list of factor names enabled for this category

The structure is intentionally data driven so additional categories can be
extended without modifying engine logic.
"""

from typing import Any, Dict

try:  # Allow usage as package or standalone module
    from .taxonomy import Category
except ImportError:  # pragma: no cover
    from taxonomy import Category

# Default rule template used when a category has no specific definition.
DEFAULT_RULE: Dict[str, Any] = {
    "primary_significators": [],
    "allowed_turned_houses": {},
    "outcome_houses": [4],
    # By default consider general debilitation and cadent placement factors
    "scored_factors": ["debilitation", "cadent_significator"],
}

# Ruleset mapping categories to their specific configuration.
CATEGORY_RULES: Dict[Category, Dict[str, Any]] = {
    cat: {k: (v.copy() if isinstance(v, dict) else list(v) if isinstance(v, list) else v)
          for k, v in DEFAULT_RULE.items()}
    for cat in Category
}

# Template for relationship / partner's maturity/healing questions.
CATEGORY_RULES[Category.RELATIONSHIP] = {
    "primary_significators": ["L1", "L7"],  # ONLY the main significators
    "secondary_significators": ["L4"],  # Supporting significator (foundation)
    # Partner's health/maturity uses turned 6th and 9th from the 7th
    # which correspond to radical 12th and 3rd houses respectively.
    "allowed_turned_houses": {"L7": [6, 9]},
    # CRITICAL: Only houses directly relevant to relationship outcomes
    "outcome_houses": [4, 12],  # Foundation, hidden obstacles ONLY
    "irrelevant_houses": [2, 3, 5, 6, 8, 9, 10, 11],  # Exclude irrelevant houses
    # Relationship-specific factors
    "scored_factors": ["debilitation", "cadent_significator", "significator_strength"],
    # HIERARCHY: Define testimony importance levels
    "testimony_hierarchy": {
        "major": ["perfection", "translation", "collection", "mutual_reception"],  # 100 weight
        "secondary": ["significator_dignity", "significator_aspects", "moon_testimony"],  # 50-70 weight  
        "minor": ["house_condition", "general_benefic"],  # 10-20 weight
        "context": ["cadent_significator", "debilitation"]  # 5-10 weight
    }
}

# CRITICAL FIX: Gambling/speculation questions need relevant houses
CATEGORY_RULES[Category.GAMBLING] = {
    "primary_significators": ["L1", "L5", "L2"],  # Self, gambling, money
    "allowed_turned_houses": {},
    "outcome_houses": [1, 2, 4, 5, 7, 8, 11],    # Self, money, foundation, gambling, others, others' money, hopes
    "scored_factors": ["debilitation", "cadent_significator", "house_condition", "end_matter"],
}

# CRITICAL FIX: Lost object questions need relevant houses for proper testimony evaluation
CATEGORY_RULES[Category.LOST_OBJECT] = {
    "primary_significators": ["L1", "L2", "L4"],  # Self, possessions, foundations/endings
    "allowed_turned_houses": {},
    "outcome_houses": [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12],  # Allow all houses for comprehensive analysis
    "scored_factors": ["debilitation", "cadent_significator", "house_condition", "reception"],
}

# CRITICAL FIX: Pet questions use traditional 1st/6th house analysis
CATEGORY_RULES[Category.PET] = {
    "primary_significators": ["L1", "L6"],  # Self (ability to act), small animals (pet's life)
    "allowed_turned_houses": {},
    "outcome_houses": [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12],  # Allow all houses for comprehensive analysis
    "scored_factors": ["debilitation", "cadent_significator", "house_condition", "reception"],
}

# CRITICAL FIX: Property questions use traditional 1st/4th house analysis
CATEGORY_RULES[Category.PROPERTY] = {
    "primary_significators": ["L1", "L4"],  # Self (ability to act), property/real estate/immovable goods
    "secondary_significators": ["L2"],  # Resources/money for purchase
    "allowed_turned_houses": {},
    "outcome_houses": [2, 8, 11],  # Resources, others' money (loans), hopes/gains
    "irrelevant_houses": [3, 5, 6, 7, 9, 10, 12],  # Exclude irrelevant houses
    "scored_factors": ["debilitation", "cadent_significator", "significator_strength"],
    "testimony_hierarchy": {
        "major": ["perfection", "translation", "collection", "mutual_reception"],
        "secondary": ["significator_dignity", "significator_aspects", "moon_testimony"],
        "minor": ["house_condition", "general_benefic"],
        "context": ["cadent_significator", "debilitation"]
    }
}

def get_category_rules(category: Category | None) -> Dict[str, Any]:
    """Return rules for a given category, falling back to defaults."""
    if category is None:
        return DEFAULT_RULE.copy()
    return CATEGORY_RULES.get(category, DEFAULT_RULE).copy()
