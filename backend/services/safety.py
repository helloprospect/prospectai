"""
Safety rails for the optimization engine.
Prevents the optimizer from making dangerous or data-sparse changes.
"""
from dataclasses import dataclass

RULES = {
    "max_weight_change_per_run": 0.05,
    "absolute_floor_score": 35,
    "min_sample_size_for_prompt_change": 100,
    "min_sample_size_for_weight_change": 150,
    "emergency_pause_open_rate": 0.10,
    "min_confidence_to_auto_apply": 0.65,
    "confidence_requires_human_review": 0.50,
}


@dataclass
class SafetyCheckResult:
    should_run: bool
    should_auto_apply: bool
    requires_review: bool
    skip_reason: str | None
    warnings: list[str]


def check_before_optimization(
    emails_analyzed: int,
    avg_open_rate: float | None,
) -> SafetyCheckResult:
    warnings = []

    if avg_open_rate is not None and avg_open_rate < RULES["emergency_pause_open_rate"]:
        return SafetyCheckResult(
            should_run=False,
            should_auto_apply=False,
            requires_review=False,
            skip_reason=f"Emergency pause: open rate {avg_open_rate:.1%} is below {RULES['emergency_pause_open_rate']:.0%} threshold. Check sending health.",
            warnings=[],
        )

    if emails_analyzed < RULES["min_sample_size_for_weight_change"]:
        warnings.append(
            f"Only {emails_analyzed} emails analyzed. Weight changes need {RULES['min_sample_size_for_weight_change']}+ samples."
        )

    return SafetyCheckResult(
        should_run=True,
        should_auto_apply=True,
        requires_review=False,
        skip_reason=None,
        warnings=warnings,
    )


def validate_claude_output(
    changes: dict,
    current_weights: dict,
    emails_analyzed: int,
    confidence: float,
) -> tuple[dict, list[str]]:
    """
    Validate and clamp Claude's recommended changes.
    Returns (sanitized_changes, list_of_warnings).
    """
    warnings = []
    sanitized = dict(changes)

    # Validate weight changes
    weight_changes = sanitized.get("weight_changes", {})
    if weight_changes and emails_analyzed < RULES["min_sample_size_for_weight_change"]:
        warnings.append(
            f"Weight changes skipped: only {emails_analyzed} samples (need {RULES['min_sample_size_for_weight_change']})"
        )
        sanitized["weight_changes"] = None

    if weight_changes:
        for key, new_val in list(weight_changes.items()):
            if key == "rationale":
                continue
            if not isinstance(new_val, (int, float)):
                continue
            current_val = current_weights.get(key, 0.10)
            delta = new_val - current_val
            if abs(delta) > RULES["max_weight_change_per_run"]:
                clamped = current_val + (RULES["max_weight_change_per_run"] * (1 if delta > 0 else -1))
                warnings.append(
                    f"Weight '{key}' change clamped: {current_val:.3f} → {clamped:.3f} (requested {new_val:.3f})"
                )
                weight_changes[key] = round(clamped, 4)

    # Validate threshold
    threshold = sanitized.get("threshold_recommendation")
    if threshold is not None and threshold < RULES["absolute_floor_score"]:
        warnings.append(
            f"Threshold {threshold} raised to floor {RULES['absolute_floor_score']}"
        )
        sanitized["threshold_recommendation"] = RULES["absolute_floor_score"]

    # Validate prompt changes — only block if sample size too small
    prompt_changes = sanitized.get("prompt_changes", [])
    if prompt_changes and emails_analyzed < RULES["min_sample_size_for_prompt_change"]:
        warnings.append(
            f"Prompt changes skipped: only {emails_analyzed} samples (need {RULES['min_sample_size_for_prompt_change']})"
        )
        sanitized["prompt_changes"] = []

    return sanitized, warnings


def determine_apply_mode(confidence: float) -> str:
    """Returns 'auto' | 'needs_review' | 'skip'."""
    if confidence >= RULES["min_confidence_to_auto_apply"]:
        return "auto"
    if confidence >= RULES["confidence_requires_human_review"]:
        return "needs_review"
    return "skip"
