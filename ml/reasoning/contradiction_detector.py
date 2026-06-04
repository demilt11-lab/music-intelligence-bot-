"""
Detects contradictions between signal pairs that indicate artificial/inorganic activity.

Each contradiction pattern has a name, severity, and implication for hypothesis selection.
"""
from __future__ import annotations
from .types import ContradictionFlag

CONTRADICTION_PATTERNS = [
    {
        "name": "fake_viral",
        "description": "High TikTok/UGC but low Spotify saves",
        "signal_a": "tiktok_growth",
        "threshold_a": 0.50,      # a is HIGH if above this
        "operator_a": ">=",
        "signal_b": "save_rate",
        "threshold_b": 0.10,      # b is LOW if below this
        "operator_b": "<",
        "severity": "high",
        "explanation": "Content went viral on TikTok but users are not saving the track — "
                       "suggesting the song is a meme/trend vehicle rather than a genuine fan connection. "
                       "This is the primary indicator of a TikTok spike that will not convert to sustained streaming.",
        "hypothesis_implication": "Supports Hypothesis B (plateau) or C (artificial) over A (breakout)",
    },
    {
        "name": "algorithmic_push",
        "description": "High streams but high skip rate",
        "signal_a": "stream_velocity",
        "threshold_a": 0.40,
        "operator_a": ">=",
        "signal_b": "skip_rate",
        "threshold_b": 0.55,
        "operator_b": ">=",
        "severity": "high",
        "explanation": "High stream velocity combined with high skip rate indicates the song "
                       "is being surfaced by algorithmic recommendations but listeners are not "
                       "completing plays. DSPs count skipped streams; this inflates velocity "
                       "without representing genuine audience interest.",
        "hypothesis_implication": "Supports Hypothesis B (algorithmic plateau) or C (gaming)",
    },
    {
        "name": "bought_followers",
        "description": "High follower velocity but low stream velocity",
        "signal_a": "follower_velocity",
        "threshold_a": 0.30,
        "operator_a": ">=",
        "signal_b": "stream_velocity",
        "threshold_b": 0.10,
        "operator_b": "<",
        "severity": "medium",
        "explanation": "Follower growth is not translating to streams — a classic signature "
                       "of purchased followers or follow-for-follow campaigns. Real fans stream; "
                       "purchased followers do not.",
        "hypothesis_implication": "Supports Hypothesis C (artificial)",
    },
    {
        "name": "meme_without_fanbase",
        "description": "High UGC but very low listener-to-follower conversion",
        "signal_a": "tiktok_growth",
        "threshold_a": 0.40,
        "operator_a": ">=",
        "signal_b": "listener_follower_conversion",
        "threshold_b": 0.02,
        "operator_b": "<",
        "severity": "medium",
        "explanation": "Music is being used in viral content but users are not converting to "
                       "artist followers. The song is functioning as an audio meme, not as "
                       "an artist discovery vehicle. Without follower conversion, chart impact is unlikely.",
        "hypothesis_implication": "Supports Hypothesis B (plateau)",
    },
    {
        "name": "chart_gaming",
        "description": "Strong chart momentum but low organic signals",
        "signal_a": "chart_momentum",
        "threshold_a": 0.60,
        "operator_a": ">=",
        "signal_b": "organic_score",
        "threshold_b": 0.15,
        "operator_b": "<",
        "severity": "medium",
        "explanation": "Chart position is improving faster than organic engagement signals "
                       "would predict. This can indicate playlist manipulation, purchase-based "
                       "charting, or heavy promotional spending not backed by genuine listener interest.",
        "hypothesis_implication": "Supports Hypothesis C (artificial) or B (label-pushed plateau)",
    },
    {
        "name": "radio_without_digital",
        "description": "Radio airplay present but no digital signals",
        "signal_a": "radio_spike",
        "threshold_a": 0.30,
        "operator_a": ">=",
        "signal_b": "tiktok_growth",
        "threshold_b": 0.10,
        "operator_b": "<",
        "severity": "low",
        "explanation": "Traditional radio presence without any digital/social signals. "
                       "In the current era, radio-only artists rarely sustain cross-platform "
                       "momentum. This is not a fraud signal but a ceiling signal — the "
                       "artist may have a radio career without a streaming breakthrough.",
        "hypothesis_implication": "Supports Hypothesis B (traditional-only plateau)",
    },
]

_SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _check_condition(value: float, operator: str, threshold: float) -> bool:
    """Evaluate a single threshold condition."""
    if operator == ">=":
        return value >= threshold
    elif operator == ">":
        return value > threshold
    elif operator == "<":
        return value < threshold
    elif operator == "<=":
        return value <= threshold
    return False


def detect_contradictions(signals: dict) -> list[ContradictionFlag]:
    """
    Detect contradiction patterns in the signal set.

    Iterates all CONTRADICTION_PATTERNS, checks if both signals are present,
    and if both threshold conditions are satisfied creates a ContradictionFlag.

    Returns sorted by severity (high first), then signal_a name.
    """
    found: list[ContradictionFlag] = []

    for pattern in CONTRADICTION_PATTERNS:
        sig_a = pattern["signal_a"]
        sig_b = pattern["signal_b"]

        val_a = signals.get(sig_a)
        val_b = signals.get(sig_b)

        # Skip if either signal is missing
        if val_a is None or val_b is None:
            continue

        cond_a = _check_condition(val_a, pattern["operator_a"], pattern["threshold_a"])
        cond_b = _check_condition(val_b, pattern["operator_b"], pattern["threshold_b"])

        if cond_a and cond_b:
            found.append(ContradictionFlag(
                signal_a=sig_a,
                value_a=val_a,
                signal_b=sig_b,
                value_b=val_b,
                contradiction_type=pattern["name"],
                severity=pattern["severity"],
                explanation=pattern["explanation"],
                hypothesis_implication=pattern["hypothesis_implication"],
            ))

    # Sort: high severity first, then by signal_a name alphabetically
    found.sort(key=lambda f: (_SEVERITY_ORDER.get(f.severity, 99), f.signal_a))
    return found
