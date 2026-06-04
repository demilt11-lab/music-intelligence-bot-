"""
Five subproblem evaluators for A&R reasoning.

Each evaluator takes artist signals and returns a SubproblemResult
with evidence, confidence, and chain-of-thought reasoning.
"""
from __future__ import annotations
import logging
from typing import Optional
from .types import (
    SubproblemResult, EvidenceItem, EvidenceType, EvidenceStrength, SignalHealth
)

log = logging.getLogger(__name__)

# Thresholds (from validated A&R standards)
THRESHOLDS = {
    "stream_velocity_monthly":    0.25,   # >25%/month = breakout trajectory
    "save_rate_committed_fans":   0.15,   # >15% = committed fanbase
    "tiktok_growth_viral":        0.50,   # >0.5 normalized = viral traction
    "follower_velocity_strong":   0.15,   # >15%/month = strong social growth
    "skip_rate_organic":          0.35,   # <35% skip = organic listening
    "playlist_add_rate_healthy":  0.10,   # >10% of playlists adding = healthy
    "ugc_weekly_viral":           0.40,   # >0.4 normalized = viral UGC
    "listener_follower_conv":     0.05,   # >5% conversion = loyal fanbase
    "algo_traffic_concern":       0.80,   # >80% algorithmic = not organic
    "tiktok_spike_persistence":   3,      # need ≥3 weeks of TikTok signal to count as persistent
}


def _make_evidence_item(
    signal: str,
    value: Optional[float],
    threshold: float,
    evidence_type: EvidenceType,
    source: str = "unknown",
    age_hours: float = 0.0,
    interpretation: str = "",
) -> EvidenceItem:
    """Helper to build an EvidenceItem with correct strength and passes flag."""
    if value is None:
        return EvidenceItem(
            signal=signal,
            value=None,
            threshold=threshold,
            passes=None,
            evidence_type=evidence_type,
            strength=EvidenceStrength.ABSENT,
            source=source,
            age_hours=age_hours,
            interpretation=interpretation or f"{signal} data is missing",
        )
    passes = value >= threshold
    if passes:
        strength = EvidenceStrength.STRONG if value > 2 * threshold else EvidenceStrength.MODERATE
    else:
        strength = EvidenceStrength.WEAK
    return EvidenceItem(
        signal=signal,
        value=value,
        threshold=threshold,
        passes=passes,
        evidence_type=evidence_type,
        strength=strength,
        source=source,
        age_hours=age_hours,
        interpretation=interpretation or (
            f"{signal}={value:.3f} {'≥' if passes else '<'} threshold {threshold} → "
            f"{'passes' if passes else 'fails'}"
        ),
    )


def evaluate_early_momentum(signals: dict) -> SubproblemResult:
    """Is this artist showing early momentum?"""
    question = "Is this artist showing early momentum?"

    sv = signals.get("stream_velocity")
    tg = signals.get("tiktok_growth")
    fv = signals.get("follower_velocity")

    ev_sv = _make_evidence_item(
        "stream_velocity", sv, THRESHOLDS["stream_velocity_monthly"],
        EvidenceType.FACT,
        interpretation=(
            f"Stream velocity {sv:.3f} {'exceeds' if sv is not None and sv >= 0.25 else 'below'} "
            f"breakout threshold 0.25" if sv is not None else "Stream velocity data missing"
        ),
    )
    ev_tg = _make_evidence_item(
        "tiktok_growth", tg, 0.0,
        EvidenceType.FACT,
        interpretation=(
            f"TikTok growth {tg:.3f} is {'positive' if tg is not None and tg > 0 else 'zero/negative'}"
            if tg is not None else "TikTok growth data missing"
        ),
    )
    ev_fv = _make_evidence_item(
        "follower_velocity", fv, 0.0,
        EvidenceType.FACT,
        interpretation=(
            f"Follower velocity {fv:.3f} is {'positive' if fv is not None and fv > 0 else 'zero/negative'}"
            if fv is not None else "Follower velocity data missing"
        ),
    )

    passing = []
    absent = []
    failing = []

    for ev, val, thr in [(ev_sv, sv, 0.25), (ev_tg, tg, 0.0), (ev_fv, fv, 0.0)]:
        if val is None:
            absent.append(ev)
        elif val >= thr:
            passing.append(ev)
        else:
            failing.append(ev)

    n_pass = len(passing)
    n_total_present = n_pass + len(failing)

    if len(absent) == 3:
        answer = "insufficient_data"
        confidence = 0.0
    elif n_pass == 3:
        answer = "yes"
        confidence = 0.85
    elif n_pass == 2:
        answer = "unclear"
        confidence = 0.60
    elif n_pass == 1:
        answer = "unclear"
        confidence = 0.40
    else:
        answer = "no"
        confidence = 0.20

    fired = [e.signal for e in passing]
    not_fired = [e.signal for e in failing]
    missing_sigs = [e.signal for e in absent]

    reasoning_parts = []
    if fired:
        reasoning_parts.append(f"Signals above threshold: {', '.join(fired)}.")
    if not_fired:
        reasoning_parts.append(f"Signals below threshold: {', '.join(not_fired)}.")
    if missing_sigs:
        reasoning_parts.append(f"Missing signals (cannot evaluate): {', '.join(missing_sigs)}.")
    reasoning_parts.append(
        f"Overall: {n_pass} of {n_total_present} present signals pass → answer='{answer}', "
        f"confidence={confidence:.2f}."
    )

    return SubproblemResult(
        question=question,
        answer=answer,
        confidence=confidence,
        evidence_used=[ev_sv, ev_tg, ev_fv],
        reasoning=" ".join(reasoning_parts),
    )


def evaluate_organic_vs_artificial(signals: dict) -> SubproblemResult:
    """Is the momentum organic or artificial (bot-driven)?"""
    question = "Is the momentum organic or artificial (bot-driven)?"

    tg = signals.get("tiktok_growth")
    sr = signals.get("save_rate")
    sv = signals.get("stream_velocity")
    skip = signals.get("skip_rate")
    fv = signals.get("follower_velocity")
    ugc = signals.get("ugc_count")
    lfc = signals.get("listener_follower_conversion")

    high_contradictions = []
    medium_contradictions = []
    reasoning_parts = []
    evidence_used = []

    # Pattern 1: fake_viral — TikTok high but save_rate low
    if tg is not None and sr is not None:
        if tg > 0.5 and sr < 0.10:
            high_contradictions.append("fake_viral")
            reasoning_parts.append(
                f"FAKE VIRAL detected: TikTok growth={tg:.3f} (>0.5) but save_rate={sr:.3f} (<0.10) — "
                "content is viral but not converting to fans."
            )
        evidence_used.append(_make_evidence_item("tiktok_growth", tg, 0.50, EvidenceType.FACT))
        evidence_used.append(_make_evidence_item("save_rate", sr, 0.10, EvidenceType.FACT))

    # Pattern 2: algorithmic_push — stream velocity high but skip rate high
    if sv is not None and skip is not None:
        if sv >= 0.40 and skip > 0.60:
            high_contradictions.append("algorithmic_push")
            reasoning_parts.append(
                f"ALGORITHMIC PUSH detected: stream_velocity={sv:.3f} (≥0.40) but skip_rate={skip:.3f} (>0.60) — "
                "streams are not reflecting genuine listener intent."
            )
        evidence_used.append(_make_evidence_item("stream_velocity", sv, 0.40, EvidenceType.FACT))
        evidence_used.append(_make_evidence_item("skip_rate", skip, 0.60, EvidenceType.FACT))

    # Pattern 3: bought_followers — follower velocity high but stream velocity low
    if fv is not None and sv is not None:
        if fv > 0.30 and sv < 0.10:
            medium_contradictions.append("bought_followers")
            reasoning_parts.append(
                f"BOUGHT FOLLOWERS suspected: follower_velocity={fv:.3f} (>0.30) but stream_velocity={sv:.3f} (<0.10) — "
                "followers not translating to streams."
            )
        if "stream_velocity" not in {e.signal for e in evidence_used}:
            evidence_used.append(_make_evidence_item("stream_velocity", sv, 0.10, EvidenceType.FACT))
        evidence_used.append(_make_evidence_item("follower_velocity", fv, 0.30, EvidenceType.FACT))

    # Pattern 4: meme_without_fanbase — high ugc but very low listener-follower conversion
    if ugc is not None and lfc is not None:
        if ugc > 0.40 and lfc < 0.02:
            medium_contradictions.append("meme_without_fanbase")
            reasoning_parts.append(
                f"MEME WITHOUT FANBASE: ugc_count={ugc:.3f} (>0.40) but listener_follower_conversion={lfc:.3f} (<0.02) — "
                "song is audio meme, not artist discovery vehicle."
            )
        evidence_used.append(_make_evidence_item("ugc_count", ugc, 0.40, EvidenceType.FACT))
        evidence_used.append(_make_evidence_item("listener_follower_conversion", lfc, 0.02, EvidenceType.FACT))

    n_high = len(high_contradictions)
    n_medium = len(medium_contradictions)

    if n_high == 0 and n_medium == 0:
        answer = "organic"
        confidence = 0.75
        reasoning_parts.insert(0, "No contradiction patterns detected.")
    elif n_high == 1 and n_medium == 0:
        answer = "suspect"
        confidence = 0.55
    elif n_high >= 2:
        answer = "artificial"
        confidence = 0.80
    else:
        answer = "suspect"
        confidence = 0.50

    reasoning_parts.append(
        f"Summary: {n_high} high-severity, {n_medium} medium-severity contradictions → answer='{answer}', "
        f"confidence={confidence:.2f}."
    )

    return SubproblemResult(
        question=question,
        answer=answer,
        confidence=confidence,
        evidence_used=evidence_used,
        reasoning=" ".join(reasoning_parts),
    )


def evaluate_platform_momentum(signals: dict) -> SubproblemResult:
    """Is momentum on the right platform (TikTok = early signal)?"""
    question = "Is momentum on the right platform (TikTok = early signal)?"

    tg = signals.get("tiktok_growth")
    sr = signals.get("save_rate")
    ugc = signals.get("ugc_count")
    yt = signals.get("youtube_growth")
    radio = signals.get("radio_spike")

    evidence_used = []
    reasoning_parts = []
    answer = "no"
    confidence = 0.50

    # TikTok first — strongest early signal
    if tg is not None:
        ev_tg = _make_evidence_item("tiktok_growth", tg, 0.40, EvidenceType.FACT)
        evidence_used.append(ev_tg)
        if tg > 0.40:
            answer = "yes"
            confidence = 0.85
            reasoning_parts.append(
                f"TikTok growth={tg:.3f} exceeds viral threshold 0.40 — TikTok leading, strongest early signal."
            )
        else:
            reasoning_parts.append(
                f"TikTok growth={tg:.3f} present but below viral threshold 0.40."
            )
    else:
        ev_tg = _make_evidence_item("tiktok_growth", None, 0.40, EvidenceType.FACT)
        ev_tg.strength = EvidenceStrength.WEAK
        evidence_used.append(ev_tg)
        reasoning_parts.append("TikTok data is from unofficial source or missing — flagging as weak signal.")

    # Spotify saves — second priority
    if sr is not None:
        ev_sr = _make_evidence_item("save_rate", sr, 0.15, EvidenceType.FACT)
        evidence_used.append(ev_sr)
        if sr > 0.15:
            reasoning_parts.append(f"Spotify save_rate={sr:.3f} > 0.15 — Spotify engagement strong.")
            if answer != "yes":
                answer = "partial"
                confidence = 0.65
        else:
            reasoning_parts.append(f"Spotify save_rate={sr:.3f} below healthy threshold 0.15.")

    # YouTube / UGC — third priority
    if ugc is not None:
        ev_ugc = _make_evidence_item("ugc_count", ugc, 0.20, EvidenceType.FACT)
        evidence_used.append(ev_ugc)
        if ugc > 0.20:
            reasoning_parts.append(f"UGC count={ugc:.3f} indicates YouTube/social engagement.")
    if yt is not None:
        ev_yt = _make_evidence_item("youtube_growth", yt, 0.20, EvidenceType.FACT)
        evidence_used.append(ev_yt)
        if yt > 0.20:
            reasoning_parts.append(f"YouTube growth={yt:.3f} provides supplementary platform signal.")

    # Radio without digital — lagging only
    if radio is not None and radio >= 0.30:
        has_digital = (tg is not None and tg > 0.10) or (sr is not None and sr > 0.05)
        if not has_digital:
            reasoning_parts.append(
                f"Radio spike={radio:.3f} without digital signals — radio-only momentum, "
                "ceiling signal, not early indicator."
            )
            if answer not in ("yes", "partial"):
                answer = "no"
                confidence = 0.60
        ev_radio = _make_evidence_item("radio_spike", radio, 0.30, EvidenceType.FACT)
        evidence_used.append(ev_radio)

    if not reasoning_parts:
        reasoning_parts.append("Insufficient platform signal data to evaluate momentum platform.")
        answer = "insufficient_data"
        confidence = 0.20

    reasoning_parts.append(f"Platform verdict: '{answer}', confidence={confidence:.2f}.")

    return SubproblemResult(
        question=question,
        answer=answer,
        confidence=confidence,
        evidence_used=evidence_used,
        reasoning=" ".join(reasoning_parts),
    )


def evaluate_momentum_persistence(signals: dict) -> SubproblemResult:
    """Does the momentum persist (not just one viral spike)?"""
    question = "Does the momentum persist (not just one viral spike)?"

    tg = signals.get("tiktok_growth")
    history_weeks = signals.get("tiktok_history_weeks")
    slope = signals.get("signal_trend_slope")
    sv = signals.get("stream_velocity")

    evidence_used = []
    reasoning_parts = []
    answer = "unclear"
    confidence = 0.40

    # TikTok history persistence check
    if tg is not None:
        ev_tg = _make_evidence_item("tiktok_growth", tg, THRESHOLDS["tiktok_spike_persistence"], EvidenceType.FACT)
        evidence_used.append(ev_tg)

    if history_weeks is not None:
        ev_hw = _make_evidence_item(
            "tiktok_history_weeks", history_weeks, THRESHOLDS["tiktok_spike_persistence"],
            EvidenceType.FACT,
            interpretation=f"TikTok signal present for {history_weeks:.0f} weeks",
        )
        evidence_used.append(ev_hw)
        if history_weeks < 1:
            answer = "unclear"
            confidence = 0.30
            reasoning_parts.append(
                f"Single data point ({history_weeks:.0f} weeks of TikTok history) — persistence unknown."
            )
        elif history_weeks >= THRESHOLDS["tiktok_spike_persistence"]:
            if slope is not None and slope > 0:
                answer = "yes"
                confidence = 0.80
                reasoning_parts.append(
                    f"Persistent momentum: {history_weeks:.0f} weeks of TikTok signal with rising trend "
                    f"(slope={slope:.3f}) — qualifies as sustained."
                )
            else:
                answer = "unclear"
                confidence = 0.55
                reasoning_parts.append(
                    f"TikTok signal spans {history_weeks:.0f} weeks (≥3) but trend direction unclear."
                )
        else:
            answer = "unclear"
            confidence = 0.40
            reasoning_parts.append(
                f"Only {history_weeks:.0f} weeks of TikTok history — insufficient to confirm persistence "
                f"(need ≥{int(THRESHOLDS['tiktok_spike_persistence'])} weeks)."
            )
    else:
        reasoning_parts.append(
            "No TikTok history length available — only current snapshot. "
            "Persistence cannot be assessed from a single data point; confidence is reduced."
        )
        confidence = 0.30

    # Trend slope check
    if slope is not None:
        ev_slope = _make_evidence_item(
            "signal_trend_slope", slope, 0.0, EvidenceType.INFERENCE,
            interpretation=f"Trend slope={slope:.3f}: {'rising' if slope > 0 else 'declining or flat'}",
        )
        evidence_used.append(ev_slope)
        if slope < 0:
            answer = "no"
            confidence = max(confidence, 0.65)
            reasoning_parts.append(
                f"Trend slope={slope:.3f} is declining — spike fading, plateau risk."
            )
        elif slope > 0 and answer not in ("yes",):
            reasoning_parts.append(f"Trend slope={slope:.3f} is positive (rising).")

    # Stream velocity acceleration check
    if sv is not None:
        ev_sv = _make_evidence_item("stream_velocity", sv, 0.25, EvidenceType.FACT)
        evidence_used.append(ev_sv)
        if sv >= 0.25:
            reasoning_parts.append(
                f"Stream velocity={sv:.3f} ≥ 0.25 — streaming momentum corroborates persistence."
            )
        else:
            reasoning_parts.append(
                f"Stream velocity={sv:.3f} < 0.25 — streaming not yet accelerating."
            )

    if not reasoning_parts:
        reasoning_parts.append("Insufficient data to evaluate momentum persistence.")
        answer = "insufficient_data"
        confidence = 0.10

    reasoning_parts.append(f"Persistence verdict: '{answer}', confidence={confidence:.2f}.")

    return SubproblemResult(
        question=question,
        answer=answer,
        confidence=confidence,
        evidence_used=evidence_used,
        reasoning=" ".join(reasoning_parts),
    )


def evaluate_infrastructure(signals: dict) -> SubproblemResult:
    """Does the artist have infrastructure to scale?"""
    question = "Does the artist have infrastructure to scale?"

    ps = signals.get("playlist_signal")
    radio = signals.get("radio_spike")
    presave = signals.get("pre_save_normalized")
    sv = signals.get("stream_velocity")
    fv = signals.get("follower_velocity")

    evidence_used = []
    reasoning_parts = []
    proxies_passed = 0

    reasoning_parts.append(
        "NOTE: Infrastructure signals are proxies — no direct label data available. "
        "Treating editorial playlist presence, radio coverage, pre-save campaigns, "
        "and fan conversion ratio as indirect indicators."
    )

    # Proxy 1: Editorial playlist presence
    if ps is not None:
        ev_ps = _make_evidence_item(
            "playlist_signal", ps, 0.20, EvidenceType.INFERENCE,
            interpretation=f"Playlist signal={ps:.3f}: {'curators have noticed' if ps > 0.20 else 'limited curation presence'}",
        )
        evidence_used.append(ev_ps)
        if ps > 0.20:
            proxies_passed += 1
            reasoning_parts.append(f"Playlist signal={ps:.3f} > 0.20 — curators have noticed this artist.")
        else:
            reasoning_parts.append(f"Playlist signal={ps:.3f} ≤ 0.20 — limited editorial curation.")

    # Proxy 2: Radio coverage
    if radio is not None:
        ev_radio = _make_evidence_item(
            "radio_spike", radio, 0.10, EvidenceType.INFERENCE,
            interpretation=f"Radio spike={radio:.3f}: {'traditional radio coverage' if radio > 0.10 else 'minimal radio presence'}",
        )
        evidence_used.append(ev_radio)
        if radio > 0.10:
            proxies_passed += 1
            reasoning_parts.append(f"Radio spike={radio:.3f} > 0.10 — traditional radio coverage present.")
        else:
            reasoning_parts.append(f"Radio spike={radio:.3f} ≤ 0.10 — minimal radio presence.")

    # Proxy 3: Pre-save campaign
    if presave is not None:
        ev_ps2 = _make_evidence_item(
            "pre_save_normalized", presave, 0.10, EvidenceType.INFERENCE,
            interpretation=f"Pre-save={presave:.3f}: {'label/distributor running campaign' if presave > 0.10 else 'no significant pre-save activity'}",
        )
        evidence_used.append(ev_ps2)
        if presave > 0.10:
            proxies_passed += 1
            reasoning_parts.append(
                f"Pre-save normalized={presave:.3f} > 0.10 — label or distributor is running a pre-save campaign."
            )
        else:
            reasoning_parts.append(f"Pre-save={presave:.3f} ≤ 0.10 — no significant pre-save campaign detected.")

    # Proxy 4: Follower/listener ratio (fan conversion)
    if fv is not None and sv is not None and sv > 0:
        ratio = fv / sv
        ev_ratio = _make_evidence_item(
            "follower_listener_ratio", ratio, 0.10, EvidenceType.INFERENCE,
            interpretation=f"Follower/listener proxy ratio={ratio:.3f}: {'loyal fanbase' if ratio > 0.10 else 'casual listeners predominate'}",
        )
        evidence_used.append(ev_ratio)
        if ratio > 0.10:
            proxies_passed += 1
            reasoning_parts.append(
                f"Follower/listener ratio={ratio:.3f} > 0.10 — base of true fans, not just casual listeners."
            )
        else:
            reasoning_parts.append(f"Follower/listener ratio={ratio:.3f} ≤ 0.10 — predominantly casual audience.")

    if proxies_passed >= 3:
        answer = "yes"
        confidence = 0.70
    elif proxies_passed == 2:
        answer = "partial"
        confidence = 0.50
    elif proxies_passed == 1:
        answer = "no"
        confidence = 0.55
    else:
        if len(evidence_used) == 0:
            answer = "insufficient_data"
            confidence = 0.10
        else:
            answer = "no"
            confidence = 0.60

    reasoning_parts.append(
        f"{proxies_passed} of 4 infrastructure proxies passed → answer='{answer}', confidence={confidence:.2f}. "
        "Treat this subproblem with higher uncertainty than momentum or organic signals."
    )

    return SubproblemResult(
        question=question,
        answer=answer,
        confidence=confidence,
        evidence_used=evidence_used,
        reasoning=" ".join(reasoning_parts),
    )
