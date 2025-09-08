"""Evaluation pipeline orchestrating testimony extraction and aggregation."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Union
import os
from pathlib import Path
import sys
from dataclasses import is_dataclass

# Ensure repository root on path when executed directly
sys.path.append(str(Path(__file__).resolve().parents[1]))

from horary_config import cfg

from category_router import get_contract
from horary_engine.engine import (
    extract_testimonies,
    serialize_reasoning_v1,
    USE_REASONING_V1,
)
from horary_engine.rationale import build_rationale
from horary_engine.utils import token_to_string
from horary_engine.serialization import serialize_primitive, deserialize_chart_for_evaluation
from models import HoraryChart

logger = logging.getLogger(__name__)


def evaluate_chart(
    chart: Union[Dict[str, Any], HoraryChart], use_dsl: Optional[bool] = None
) -> Dict[str, Any]:
    """Evaluate a horary chart and return verdict with diagnostics.

    The function performs the following steps:

    1. Resolve the category contract (e.g., Sun as examiner for education).
    2. Extract normalized testimony tokens from the chart.
    3. Aggregate testimonies into a numeric score and contribution ledger.
    4. Build a human readable rationale from the ledger.

    Args:
        chart: Parsed chart information.
        use_dsl: Optional override for the aggregation engine. If ``None`` the
            value is sourced from the ``HORARY_USE_DSL`` environment variable or
            ``aggregator.use_dsl`` setting. This makes it easy for API callers to
            supply a query or header flag without editing config files.
    """
    if isinstance(chart, dict):
        contract = get_contract(chart.get("category", ""))
        if "timezone_info" in chart:
            chart_obj = deserialize_chart_for_evaluation(chart)
        else:
            chart_obj = chart
    else:
        contract = get_contract(getattr(chart, "category", ""))
        chart_obj = chart

    testimonies = extract_testimonies(chart_obj, contract)

    config_obj = cfg()

    def _cfg_get(path: str, default: Any = None):
        if hasattr(config_obj, "get"):
            return config_obj.get(path, default)
        current = config_obj
        for part in path.split("."):
            current = getattr(current, part, None)
            if current is None:
                return default
        return current

    if use_dsl is None:
        env_override = os.getenv("HORARY_USE_DSL")
        if env_override is not None:
            use_dsl = env_override.lower() in {"1", "true", "yes"}
        else:
            use_dsl = _cfg_get("aggregator.use_dsl", False)

    if use_dsl:
        from horary_engine.dsl import (
            L1,
            L10,
            L3,
            LQ,
            Moon,
            role_importance,
        )
        from horary_engine.solar_aggregator import aggregate as aggregator_fn

        testimonies = [
            role_importance(L1, _cfg_get("aggregator.role_importance.L1", 1.0)),
            role_importance(LQ, _cfg_get("aggregator.role_importance.LQ", 1.0)),
            role_importance(Moon, _cfg_get("aggregator.role_importance.Moon", 0.7)),
            role_importance(L10, _cfg_get("aggregator.role_importance.L10", 1.0)),
            role_importance(L3, _cfg_get("aggregator.role_importance.L3", 1.0)),
            *testimonies,
        ]
    else:
        from horary_engine.aggregator import aggregate as aggregator_fn

    dsl_primitives = [
        serialize_primitive(t) for t in testimonies if is_dataclass(t)
    ]

    if use_dsl:
        score, ledger = aggregator_fn(testimonies, contract)
    else:
        # CRITICAL FIX: Pass contract to regular aggregator for hierarchical weighting
        score, ledger = aggregator_fn(testimonies, contract)
    # Surface ledger details for downstream inspection and debugging
    logger.info(
        "Contribution ledger: %s",
        [
            {**entry, "key": token_to_string(entry.get("key"))}
            for entry in ledger
        ],
    )
    rationale = build_rationale(ledger)
    reasoning_bundle = serialize_reasoning_v1(ledger) if USE_REASONING_V1 else None
    verdict = "YES" if score > 0 else "NO"
    result = {
        "verdict": verdict,
        "ledger": ledger,
        "rationale": rationale,
        "dsl_primitives": dsl_primitives,
    }
    if reasoning_bundle is not None:
        result["reasoning_v1"] = reasoning_bundle
    return result


if __name__ == "__main__":
    """Allow command-line evaluation of charts.

    When executed directly, the module accepts an optional path to a chart JSON
    file. If no path is provided, it defaults to the AE-015 sample chart.
    The resulting ledger is printed for inspection.
    """
    import argparse
    import json
    from pathlib import Path

    default_chart = Path(__file__).resolve().parent / (
        "e AE-015 – “Will I pass my physiotherapy exam.json"
    )
    parser = argparse.ArgumentParser(description="Evaluate a horary chart")
    parser.add_argument(
        "chart_path",
        nargs="?",
        default=str(default_chart),
        help="Path to chart JSON file",
    )
    args = parser.parse_args()

    chart_data = json.loads(Path(args.chart_path).read_text(encoding="utf-8"))
    result = evaluate_chart(chart_data)
    print(json.dumps(result["ledger"], indent=2))
