"""
Main A&R reasoning engine — orchestrates all subproblems, assumptions,
contradictions, and hypothesis comparison into a single ReasoningOutput.

Usage:
    engine = ARReasoningEngine()
    result = engine.reason(artist_id=1234, artist_name="Artist Name", signals={...})
    print(result.verdict)           # BreakoutVerdict.BREAKOUT
    print(result.confidence_pct)    # 78
    print(result.primary_reasoning) # "Strong TikTok-led momentum with..."
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Optional

from .types import (
    ReasoningOutput, EvidenceItem, EvidenceType, EvidenceStrength,
    SignalHealth, BreakoutVerdict
)
from .subproblems import (
    evaluate_early_momentum, evaluate_organic_vs_artificial,
    evaluate_platform_momentum, evaluate_momentum_persistence,
    evaluate_infrastructure, THRESHOLDS
)
from .assumption_tester import test_all_assumptions
from .contradiction_detector import detect_contradictions
from .hypothesis_engine import build_hypotheses, select_verdict, build_decision_path

log = logging.getLogger(__name__)

MODEL_VERSION = "1.0.0-reasoning"

SIGNAL_TTL_HOURS = {
    "tiktok_growth": 6, "stream_velocity": 48, "save_rate": 72,
    "follower_velocity": 24, "chart_momentum": 168, "radio_spike": 168,
    "playlist_signal": 24, "pre_save_normalized": 72, "skip_rate": 48,
    "listener_follower_conversion": 24, "ugc_count": 12, "organic_score": 48,
}

ALL_EXPECTED_SIGNALS = list(SIGNAL_TTL_HOURS.keys())

# Importance weights for ordering missing-data messages
_SIGNAL_IMPORTANCE = {
    "tiktok_growth": 1,
    "stream_velocity": 2,
    "save_rate": 3,
    "follower_velocity": 4,
    "skip_rate": 5,
    "listener_follower_conversion": 6,
    "ugc_count": 7,
    "organic_score": 8,
    "chart_momentum": 9,
    "playlist_signal": 10,
    "pre_save_normalized": 11,
    "radio_spike": 12,
}

_MISSING_DATA_DESCRIPTIONS = {
    "tiktok_growth": (
        "tiktok_growth: Collecting TikTok engagement velocity would enable the organic-vs-artificial "
        "subproblem and platform-momentum checks, significantly increasing verdict confidence."
    ),
    "stream_velocity": (
        "stream_velocity: Streaming velocity data would directly test the primary breakout-trajectory "
        "assumption and anchor the momentum subproblem."
    ),
    "save_rate": (
        "save_rate: Spotify save rate data would enable the committed-fan assumption test and "
        "fake-viral contradiction detection."
    ),
    "follower_velocity": (
        "follower_velocity: Follower velocity would activate the chart-prediction leading-indicator "
        "assumption and improve momentum confidence."
    ),
    "skip_rate": (
        "skip_rate: Skip rate data would enable algorithmic-push contradiction detection, "
        "distinguishing genuine from surfaced streams."
    ),
    "listener_follower_conversion": (
        "listener_follower_conversion: Conversion rate would enable meme-without-fanbase "
        "contradiction detection."
    ),
    "ugc_count": (
        "ugc_count: UGC count data would strengthen UGC amplification assumption testing."
    ),
    "organic_score": (
        "organic_score: An organic score would improve chart-gaming contradiction detection."
    ),
    "chart_momentum": (
        "chart_momentum: Chart momentum data would complete the hypothesis-B plateau analysis."
    ),
    "playlist_signal": (
        "playlist_signal: Playlist editorial signal would strengthen infrastructure proxy evaluation."
    ),
    "pre_save_normalized": (
        "pre_save_normalized: Pre-save data would confirm whether a label campaign is running."
    ),
    "radio_spike": (
        "radio_spike: Radio spike data would complete the traditional-vs-digital platform comparison."
    ),
}


class ARReasoningEngine:
    """
    Chain-of-thought A&R decision engine.

    Takes artist signals dict and returns fully structured ReasoningOutput
    with facts, inferences, hypotheses, verdict, and decision path.
    Does NOT hallucinate — missing signals are explicitly noted.
    """

    def reason(
        self,
        artist_id: int,
        artist_name: str,
        signals: dict[str, Optional[float]],
        signal_sources: Optional[dict[str, str]] = None,
        signal_ages_hours: Optional[dict[str, float]] = None,
    ) -> ReasoningOutput:
        """
        Run the full chain-of-thought reasoning process.

        Args:
            artist_id: internal artist ID
            artist_name: display name (for output only)
            signals: dict of signal_name → float value (None if missing)
            signal_sources: dict of signal_name → source string
            signal_ages_hours: dict of signal_name → age in hours

        Returns:
            ReasoningOutput with complete reasoning chain
        """
        sources = signal_sources or {}
        ages = signal_ages_hours or {}

        # ------------------------------------------------------------------ #
        # Step 1 — Classify all signals into facts / inferences / speculation #
        # ------------------------------------------------------------------ #
        facts: list[EvidenceItem] = []
        inferences: list[EvidenceItem] = []
        speculation: list[EvidenceItem] = []

        _SPECULATION_PRIORITY = [
            "tiktok_growth", "stream_velocity", "save_rate",
        ]

        for sig in ALL_EXPECTED_SIGNALS:
            val = signals.get(sig)
            age = ages.get(sig, 0.0)
            ttl = SIGNAL_TTL_HOURS.get(sig, 24)
            src = sources.get(sig, "unknown")
            threshold = 0.0  # generic; subproblems use their own thresholds

            if val is not None:
                is_unofficial = "unofficial" in src or "scrape" in src
                is_stale = age > ttl

                if not is_unofficial and not is_stale:
                    ev_type = EvidenceType.FACT
                    strength = EvidenceStrength.MODERATE
                    bucket = facts
                else:
                    ev_type = EvidenceType.INFERENCE
                    strength = EvidenceStrength.WEAK
                    bucket = inferences

                bucket.append(EvidenceItem(
                    signal=sig,
                    value=val,
                    threshold=threshold,
                    passes=None,  # classification step; not threshold-evaluated here
                    evidence_type=ev_type,
                    strength=strength,
                    source=src,
                    age_hours=age,
                    interpretation=f"{sig}={val:.4f} from '{src}' (age={age:.1f}h, TTL={ttl}h)",
                ))

        # Speculative items for top-3 most important missing signals
        missing_top3 = [
            s for s in _SPECULATION_PRIORITY if signals.get(s) is None
        ][:3]
        for sig in missing_top3:
            speculation.append(EvidenceItem(
                signal=sig,
                value=None,
                threshold=0.0,
                passes=None,
                evidence_type=EvidenceType.SPECULATION,
                strength=EvidenceStrength.ABSENT,
                source="estimated",
                age_hours=0.0,
                interpretation=(
                    f"{sig}: missing — speculative estimate based on other present signals. "
                    "Do not use for hard decisions."
                ),
            ))

        # ------------------------------------------------------------------ #
        # Step 2 — Evaluate all 5 subproblems                                #
        # ------------------------------------------------------------------ #
        subproblems = [
            evaluate_early_momentum(signals),
            evaluate_organic_vs_artificial(signals),
            evaluate_platform_momentum(signals),
            evaluate_momentum_persistence(signals),
            evaluate_infrastructure(signals),
        ]

        # ------------------------------------------------------------------ #
        # Step 3 — Test all assumptions                                       #
        # ------------------------------------------------------------------ #
        assumption_tests = test_all_assumptions(signals)

        # ------------------------------------------------------------------ #
        # Step 4 — Detect contradictions                                      #
        # ------------------------------------------------------------------ #
        contradictions = detect_contradictions(signals)
        high_sev = [c for c in contradictions if c.severity == "high"]
        if high_sev:
            log.warning(
                "Artist %s (%d): %d high-severity contradiction(s) detected: %s",
                artist_name, artist_id,
                len(high_sev),
                ", ".join(c.contradiction_type for c in high_sev),
            )

        # ------------------------------------------------------------------ #
        # Step 5 — Build and score hypotheses                                 #
        # ------------------------------------------------------------------ #
        hypotheses = build_hypotheses(subproblems, contradictions, signals)

        # ------------------------------------------------------------------ #
        # Step 6 — Select verdict                                             #
        # ------------------------------------------------------------------ #
        present_count = len([v for v in signals.values() if v is not None])
        data_completeness = present_count / len(ALL_EXPECTED_SIGNALS)
        verdict, confidence_pct, primary_reasoning = select_verdict(
            hypotheses, subproblems, data_completeness
        )

        # ------------------------------------------------------------------ #
        # Step 7 — Build decision path                                        #
        # ------------------------------------------------------------------ #
        decision_path = build_decision_path(
            subproblems, assumption_tests, contradictions, verdict
        )

        # ------------------------------------------------------------------ #
        # Step 8 — Assess signal health                                       #
        # ------------------------------------------------------------------ #
        signal_health: dict[str, SignalHealth] = {}
        for sig in ALL_EXPECTED_SIGNALS:
            val = signals.get(sig)
            age = ages.get(sig, 0.0)
            ttl = SIGNAL_TTL_HOURS.get(sig, 24)
            src = sources.get(sig, "unknown")
            if val is None:
                signal_health[sig] = SignalHealth.MISSING
            elif age > ttl:
                signal_health[sig] = SignalHealth.STALE
            elif "unofficial" in src or "scrape" in src:
                signal_health[sig] = SignalHealth.SUSPECT
            else:
                signal_health[sig] = SignalHealth.HEALTHY

        # ------------------------------------------------------------------ #
        # Step 9 — Identify missing data (what would increase confidence)     #
        # ------------------------------------------------------------------ #
        missing_signals = [
            sig for sig in ALL_EXPECTED_SIGNALS
            if signals.get(sig) is None
        ]
        missing_signals_sorted = sorted(
            missing_signals,
            key=lambda s: _SIGNAL_IMPORTANCE.get(s, 99),
        )
        missing_data: list[str] = []
        for sig in missing_signals_sorted[:5]:
            desc = _MISSING_DATA_DESCRIPTIONS.get(
                sig, f"{sig}: collecting this signal would improve verdict confidence."
            )
            missing_data.append(desc)
        # Append names of remaining missing signals without full descriptions
        for sig in missing_signals_sorted[5:]:
            missing_data.append(sig)

        # ------------------------------------------------------------------ #
        # Step 10 — Return ReasoningOutput                                    #
        # ------------------------------------------------------------------ #
        return ReasoningOutput(
            artist_id=artist_id,
            artist_name=artist_name,
            facts=facts,
            inferences=inferences,
            speculation=speculation,
            subproblem_results=subproblems,
            assumption_tests=assumption_tests,
            contradictions=contradictions,
            hypotheses=hypotheses,
            verdict=verdict,
            confidence_pct=confidence_pct,
            primary_reasoning=primary_reasoning,
            decision_path=decision_path,
            missing_data=missing_data,
            signal_health=signal_health,
            data_completeness_pct=int(data_completeness * 100),
            model_version=MODEL_VERSION,
            reasoned_at=datetime.now(timezone.utc).isoformat(),
        )
