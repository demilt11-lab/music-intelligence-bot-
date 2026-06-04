"""
Tests three core A&R assumptions against actual signal data.
Returns structured pass/fail/untestable for each assumption.
"""
from __future__ import annotations
from .types import AssumptionTest, EvidenceItem, EvidenceType, EvidenceStrength

CORE_ASSUMPTIONS = [
    {
        "id": "tiktok_precedes_streaming",
        "assumption": "TikTok viral moment precedes 11% streaming increase",
        "source": "industry research",
        "required": "tiktok_growth signal present AND stream_velocity > 0 AND tiktok_growth higher than stream_velocity",
    },
    {
        "id": "save_rate_committed_fans",
        "assumption": "Save rate >15% indicates committed fans",
        "source": "Spotify for Artists data standards",
        "required": "save_rate signal present",
    },
    {
        "id": "stream_velocity_breakout",
        "assumption": "Stream velocity >25%/month indicates breakout trajectory",
        "source": "DSP analytics benchmarks",
        "required": "stream_velocity signal present",
    },
    {
        "id": "ugc_amplification",
        "assumption": "UGC growth (TikTok/Reels) is the primary early amplification signal",
        "source": "UGC virality research",
        "required": "tiktok_growth or ugc_count signal present",
    },
    {
        "id": "follower_velocity_predictor",
        "assumption": "Follower velocity >15%/month predicts chart entry before it happens",
        "source": "Social-to-chart leading indicator analysis",
        "required": "follower_velocity signal present",
    },
]


def _make_evidence(
    signal: str,
    value,
    threshold: float,
    evidence_type: EvidenceType,
    interpretation: str,
) -> EvidenceItem:
    if value is None:
        return EvidenceItem(
            signal=signal, value=None, threshold=threshold, passes=None,
            evidence_type=evidence_type, strength=EvidenceStrength.ABSENT,
            source="unknown", age_hours=0.0, interpretation=interpretation,
        )
    passes = value >= threshold
    strength = EvidenceStrength.STRONG if (passes and value > 2 * threshold) else (
        EvidenceStrength.MODERATE if passes else EvidenceStrength.WEAK
    )
    return EvidenceItem(
        signal=signal, value=value, threshold=threshold, passes=passes,
        evidence_type=evidence_type, strength=strength,
        source="unknown", age_hours=0.0, interpretation=interpretation,
    )


def test_all_assumptions(signals: dict) -> list[AssumptionTest]:
    """
    Test all core A&R assumptions against actual signal data.

    For each assumption:
    - If required signals are missing: result="untestable"
    - If present: evaluate and return "supported" or "violated"
    """
    results: list[AssumptionTest] = []

    for assumption_def in CORE_ASSUMPTIONS:
        aid = assumption_def["id"]
        assumption_text = assumption_def["assumption"]
        required_text = assumption_def["required"]

        if aid == "tiktok_precedes_streaming":
            tg = signals.get("tiktok_growth")
            sv = signals.get("stream_velocity")
            if tg is None or sv is None:
                missing = [s for s, v in [("tiktok_growth", tg), ("stream_velocity", sv)] if v is None]
                results.append(AssumptionTest(
                    assumption=assumption_text,
                    required_value="tiktok_growth > stream_velocity, both present",
                    actual_value=f"missing: {', '.join(missing)}",
                    result="untestable",
                    evidence=[],
                    notes=f"Requires both tiktok_growth and stream_velocity. Missing: {', '.join(missing)}.",
                ))
            else:
                passes = tg > sv and sv > 0
                ev = _make_evidence(
                    "tiktok_growth", tg, sv,
                    EvidenceType.FACT,
                    f"tiktok_growth={tg:.3f} vs stream_velocity={sv:.3f} — "
                    f"TikTok {'ahead of' if tg > sv else 'not ahead of'} streaming velocity",
                )
                results.append(AssumptionTest(
                    assumption=assumption_text,
                    required_value="tiktok_growth > stream_velocity",
                    actual_value=f"tiktok_growth={tg:.3f}, stream_velocity={sv:.3f}",
                    result="supported" if passes else "violated",
                    evidence=[ev],
                    notes=(
                        f"TikTok growth ({tg:.3f}) {'exceeds' if tg > sv else 'does not exceed'} "
                        f"stream velocity ({sv:.3f}). Assumption {'holds' if passes else 'violated'}."
                    ),
                ))

        elif aid == "save_rate_committed_fans":
            sr = signals.get("save_rate")
            if sr is None:
                results.append(AssumptionTest(
                    assumption=assumption_text,
                    required_value="save_rate >= 0.15",
                    actual_value="missing",
                    result="untestable",
                    evidence=[],
                    notes="save_rate signal is absent — cannot evaluate committed fan assumption.",
                ))
            else:
                passes = sr >= 0.15
                ev = _make_evidence(
                    "save_rate", sr, 0.15, EvidenceType.FACT,
                    f"save_rate={sr:.3f} {'≥' if passes else '<'} 0.15 → "
                    f"{'committed fanbase indicated' if passes else 'below committed fan threshold'}",
                )
                results.append(AssumptionTest(
                    assumption=assumption_text,
                    required_value="save_rate >= 0.15",
                    actual_value=f"save_rate={sr:.3f}",
                    result="supported" if passes else "violated",
                    evidence=[ev],
                    notes=(
                        f"Save rate {sr:.3f} is {'above' if passes else 'below'} the 15% committed-fan threshold."
                    ),
                ))

        elif aid == "stream_velocity_breakout":
            sv = signals.get("stream_velocity")
            if sv is None:
                results.append(AssumptionTest(
                    assumption=assumption_text,
                    required_value="stream_velocity >= 0.25",
                    actual_value="missing",
                    result="untestable",
                    evidence=[],
                    notes="stream_velocity signal is absent — cannot evaluate breakout trajectory assumption.",
                ))
            else:
                passes = sv >= 0.25
                ev = _make_evidence(
                    "stream_velocity", sv, 0.25, EvidenceType.FACT,
                    f"stream_velocity={sv:.3f} {'≥' if passes else '<'} 0.25 → "
                    f"{'breakout trajectory' if passes else 'below breakout threshold'}",
                )
                results.append(AssumptionTest(
                    assumption=assumption_text,
                    required_value="stream_velocity >= 0.25",
                    actual_value=f"stream_velocity={sv:.3f}",
                    result="supported" if passes else "violated",
                    evidence=[ev],
                    notes=(
                        f"Stream velocity {sv:.3f} is {'consistent with' if passes else 'insufficient for'} "
                        "breakout trajectory."
                    ),
                ))

        elif aid == "ugc_amplification":
            tg = signals.get("tiktok_growth")
            ugc = signals.get("ugc_count")
            primary = tg if tg is not None else ugc
            primary_name = "tiktok_growth" if tg is not None else "ugc_count"
            if primary is None:
                results.append(AssumptionTest(
                    assumption=assumption_text,
                    required_value="tiktok_growth or ugc_count > 0.20",
                    actual_value="missing",
                    result="untestable",
                    evidence=[],
                    notes="Neither tiktok_growth nor ugc_count is present — UGC amplification cannot be assessed.",
                ))
            else:
                passes = primary > 0.20
                ev = _make_evidence(
                    primary_name, primary, 0.20, EvidenceType.FACT,
                    f"{primary_name}={primary:.3f} {'>' if passes else '≤'} 0.20 → "
                    f"{'UGC amplification confirmed' if passes else 'UGC amplification not yet evident'}",
                )
                results.append(AssumptionTest(
                    assumption=assumption_text,
                    required_value=f"{primary_name} > 0.20",
                    actual_value=f"{primary_name}={primary:.3f}",
                    result="supported" if passes else "violated",
                    evidence=[ev],
                    notes=(
                        f"{primary_name}={primary:.3f} {'supports' if passes else 'does not support'} "
                        "UGC as primary amplification signal."
                    ),
                ))

        elif aid == "follower_velocity_predictor":
            fv = signals.get("follower_velocity")
            if fv is None:
                results.append(AssumptionTest(
                    assumption=assumption_text,
                    required_value="follower_velocity >= 0.15",
                    actual_value="missing",
                    result="untestable",
                    evidence=[],
                    notes="follower_velocity signal is absent — cannot evaluate chart-prediction assumption.",
                ))
            else:
                passes = fv >= 0.15
                ev = _make_evidence(
                    "follower_velocity", fv, 0.15, EvidenceType.FACT,
                    f"follower_velocity={fv:.3f} {'≥' if passes else '<'} 0.15 → "
                    f"{'leading indicator present' if passes else 'below chart-prediction threshold'}",
                )
                results.append(AssumptionTest(
                    assumption=assumption_text,
                    required_value="follower_velocity >= 0.15",
                    actual_value=f"follower_velocity={fv:.3f}",
                    result="supported" if passes else "violated",
                    evidence=[ev],
                    notes=(
                        f"Follower velocity {fv:.3f} {'is a leading chart indicator' if passes else 'does not meet leading-indicator threshold'}."
                    ),
                ))

    return results
