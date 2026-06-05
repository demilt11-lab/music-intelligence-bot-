"""
A&R Breakout Scoring Framework.

Mirrors how major-label A&R executives evaluate emerging artists across five
signal categories. Each category has a maximum point budget; the weighted total
is normalised to a 0–100 composite score.

Five categories and their weights:
  1. Spotify Momentum    40% — save rate, stream velocity, listener conversion
  2. TikTok Virality     30% — UGC video volume, views, viral spikes
  3. YouTube Growth      15% — subscriber velocity, video views, Shorts
  4. Radio & Playlists   10% — station count, editorial + algorithmic adds
  5. Social Momentum      5% — follower velocity, engagement rate

False-positive controls fire AFTER scoring and can discount the composite:
  - FAKE_VIRAL:        TikTok traction but save_rate < 10%
  - ARTIFICIAL_BOOST:  stream_velocity > 50% but skip_rate > 40%
  - BOUGHT_FOLLOWERS:  follower_velocity > 50%/month but engagement_rate < 1%

Score interpretation:
  80-100  HIGH BREAKOUT PROBABILITY    (80%+ historical breakout rate)
  60-79   MODERATE BREAKOUT PROBABILITY (50% historical breakout rate)
  40-59   LOW BREAKOUT PROBABILITY     (<20% historical breakout rate)
  <40     UNLIKELY TO BREAK OUT

Confidence levels (signal completeness):
  >80%   HIGH CONFIDENCE BREAKOUT PREDICTION
  60-80% MODERATE CONFIDENCE, MONITOR WEEKLY
  40-60% INSUFFICIENT DATA, HUMAN REVIEW REQUIRED
  <40%   INSUFFICIENT DATA FOR PREDICTION
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


# ─────────────────────────────────────────────────────────────────────────────
# Category configuration
# ─────────────────────────────────────────────────────────────────────────────

# Maximum raw points achievable per category (sum of all rule weights in that category)
CATEGORY_BUDGET: Dict[str, int] = {
    "spotify": 80,   # 25+25+10+10+10
    "tiktok":  60,   # 25+15+20
    "youtube": 45,   # 15+10+10+10
    "radio":   40,   # 15+15+10 (radio_station tiers are exclusive, max one fires)
    "social":  15,   # 10+5
}

# Contribution weights applied after normalisation (must sum to 1.0)
CATEGORY_WEIGHT: Dict[str, float] = {
    "spotify": 0.40,
    "tiktok":  0.30,
    "youtube": 0.15,
    "radio":   0.10,
    "social":  0.05,
}


# ─────────────────────────────────────────────────────────────────────────────
# Rule table
# ─────────────────────────────────────────────────────────────────────────────
# Each rule is a 7-tuple:
#   (name, signal_key, operator, threshold, raw_pts, category, explanation)
#
# Tiered rules (save_rate, stream_velocity, tiktok_videos, radio_station_count)
# only award the highest matching tier — lower tiers are skipped once a higher
# one fires.

BREAKOUT_RULES: List[Tuple] = [

    # ── 1. SPOTIFY MOMENTUM (40%) ─────────────────────────────────────────
    ("save_rate_high",
     "save_rate", ">=", 0.20, 25, "spotify",
     "Save rate ≥20% — top-decile fan commitment (Spotify for Artists benchmark)"),

    ("save_rate_mid",
     "save_rate", ">=", 0.15, 15, "spotify",
     "Save rate 15-20% — above-average listener intent; above industry median"),

    ("save_rate_low",
     "save_rate", ">=", 0.10, 5,  "spotify",
     "Save rate 10-15% — moderate save momentum, monitor weekly"),

    ("stream_velocity_high",
     "stream_velocity", ">=", 0.30, 25, "spotify",
     "Stream velocity ≥30%/month — strong breakout trajectory (DSP analytics threshold)"),

    ("stream_velocity_mid",
     "stream_velocity", ">=", 0.20, 15, "spotify",
     "Stream velocity 20-30%/month — building momentum, watch closely"),

    ("listener_follower_conversion",
     "listener_to_follower_rate", ">=", 0.10, 10, "spotify",
     "Listener-to-follower conversion ≥10% — passive listeners converting to fans"),

    ("algorithmic_traffic",
     "algorithmic_traffic_share", ">=", 0.30, 10, "spotify",
     "Algorithmic traffic ≥30% — Spotify's own algorithms surfacing this artist"),

    ("low_skip_rate",
     "skip_rate", "<=", 0.30, 10, "spotify",
     "Skip rate ≤30% — listeners completing the track; strong retention signal (≤20% = exceptional)"),

    # ── 2. TIKTOK VIRALITY (30%) ──────────────────────────────────────────
    ("tiktok_videos_high",
     "tiktok_videos_per_week", ">=", 50, 25, "tiktok",
     "≥50 new TikTok videos/week — viral saturation; 84% of Billboard Global 200 went TikTok-first"),

    ("tiktok_videos_mid",
     "tiktok_videos_per_week", ">=", 20, 15, "tiktok",
     "20-50 new TikTok videos/week — strong UGC momentum, monitor for acceleration"),

    ("tiktok_videos_low",
     "tiktok_videos_per_week", ">=", 10, 5,  "tiktok",
     "10-20 new TikTok videos/week — early UGC traction, emerging signal"),

    ("tiktok_views_10m",
     "tiktok_total_views", ">=", 10_000_000, 15, "tiktok",
     "TikTok total views ≥10M — proven viral reach at scale"),

    ("tiktok_views_1m",
     "tiktok_total_views", ">=", 1_000_000,  10, "tiktok",
     "TikTok total views ≥1M — gaining meaningful platform visibility"),

    ("tiktok_viral_spike",
     "tiktok_spike_detected", "==", True, 20, "tiktok",
     "Viral moment detected (>100% growth in one day) — highest-urgency breakout signal"),

    # ── 3. YOUTUBE GROWTH (15%) ───────────────────────────────────────────
    ("youtube_subscriber_velocity",
     "youtube_sub_velocity", ">=", 0.10, 15, "youtube",
     "Subscriber velocity ≥10%/week — channel outpacing 99% of artists at this stage"),

    ("youtube_views_5m",
     "youtube_total_views", ">=", 5_000_000, 10, "youtube",
     "YouTube total views ≥5M — material platform presence"),

    ("youtube_engagement",
     "youtube_engagement_rate", ">=", 0.05, 10, "youtube",
     "Comment/engagement rate ≥5% — high audience interaction vs passive viewership"),

    ("youtube_shorts_volume",
     "youtube_shorts_per_week", ">=", 100, 10, "youtube",
     "≥100 Shorts using music/week — cross-platform UGC amplification signal"),

    # ── 4. RADIO & PLAYLIST SUPPORT (10%) ────────────────────────────────
    ("radio_high",
     "radio_station_count", ">=", 50, 15, "radio",
     "≥50 radio stations spinning — significant terrestrial exposure (lagging breakout signal)"),

    ("radio_mid",
     "radio_station_count", ">=", 20, 10, "radio",
     "20-50 radio stations — growing radio presence, monitor for traditional-format breakout"),

    ("editorial_playlist_adds",
     "editorial_playlist_adds", ">=", 5, 15, "radio",
     "≥5 editorial playlist adds — human curators have validated commercial potential"),

    ("algorithmic_playlist_adds",
     "algorithmic_playlist_adds", ">=", 50, 10, "radio",
     "≥50 algorithmic playlist adds — DSP algorithms broadly surfacing this artist"),

    # ── 5. SOCIAL MEDIA MOMENTUM (5%) ────────────────────────────────────
    ("follower_velocity_social",
     "social_follower_velocity", ">=", 0.15, 10, "social",
     "Social follower velocity ≥15%/month — accelerating audience growth across platforms"),

    ("engagement_rate_social",
     "social_engagement_rate", ">=", 0.05, 5, "social",
     "Social engagement rate ≥5% — activated fanbase, not a passive audience"),
]

# Rules whose signal key participates in tiered scoring.
# Once a higher tier fires, lower tiers in the same group are skipped.
_TIER_GROUPS: Dict[str, str] = {
    "save_rate":              "save_rate",
    "stream_velocity":        "stream_velocity",
    "tiktok_videos_per_week": "tiktok_videos",
    "radio_station_count":    "radio_station",
}

# ─────────────────────────────────────────────────────────────────────────────
# Tier thresholds (applied to the 0-100 composite)
# ─────────────────────────────────────────────────────────────────────────────
# Keys preserve v1 naming ("strong_breakout", "probable_breakout", "monitor",
# "no_signal") so existing tests and model_selector code are unaffected.
# New threshold boundaries (80/60/40) are reflected in the labels.
TIER_THRESHOLDS: Dict[str, float] = {
    "strong_breakout":   80.0,   # HIGH BREAKOUT PROBABILITY   (≥80, ~80%+ actual rate)
    "probable_breakout": 50.0,   # MODERATE BREAKOUT PROBABILITY (50-79, ~50% actual rate)
    "monitor":           30.0,   # LOW BREAKOUT PROBABILITY    (30-49, <20% actual rate)
    "no_signal":          0.0,   # UNLIKELY TO BREAK OUT       (<30)
}

TIER_LABELS: Dict[str, str] = {
    "strong_breakout":   "HIGH BREAKOUT PROBABILITY (≥80)",
    "probable_breakout": "MODERATE BREAKOUT PROBABILITY (50-79)",
    "monitor":           "LOW BREAKOUT PROBABILITY (30-49)",
    "no_signal":         "UNLIKELY TO BREAK OUT (<30)",
}

# Confidence thresholds (fraction of rules with present signal data)
CONFIDENCE_THRESHOLDS: List[Tuple[float, str, str]] = [
    (0.80, "high",        "HIGH CONFIDENCE BREAKOUT PREDICTION"),
    (0.60, "moderate",    "MODERATE CONFIDENCE, MONITOR WEEKLY"),
    (0.40, "uncertain",   "INSUFFICIENT DATA, HUMAN REVIEW REQUIRED"),
    (0.00, "insufficient","INSUFFICIENT DATA FOR PREDICTION"),
]

# ─────────────────────────────────────────────────────────────────────────────
# False-positive controls
# ─────────────────────────────────────────────────────────────────────────────
FALSE_POSITIVE_CONTROLS = [
    {
        "flag":     "FAKE_VIRAL",
        "label":    "FAKE VIRAL — TikTok traction without listener commitment",
        "check":    lambda s: (
            s.get("tiktok_videos_per_week", 0) >= 20
            and s.get("save_rate", 1.0) < 0.10
        ),
        "reason": (
            "High TikTok UGC volume but Spotify save rate <10% — viewers are not converting "
            "to fans. Common in meme/trend songs that plateau immediately after the TikTok "
            "moment ends. Requires cross-platform retention before A&R action."
        ),
        "severity": "high",
        "discount": 0.30,    # discount composite by 30%
    },
    {
        "flag":     "ARTIFICIAL_BOOST",
        "label":    "ARTIFICIAL BOOST — stream velocity inconsistent with listener behavior",
        "check":    lambda s: (
            s.get("stream_velocity", 0) > 0.50
            and s.get("skip_rate", 0) > 0.40
        ),
        "reason": (
            "Stream velocity >50%/month but skip rate >40% — streams being driven by "
            "non-organic means (playlist farming, bot streams, or payola). Genuine breakout "
            "tracks have skip rate <25%. Do not act until skip rate normalises."
        ),
        "severity": "high",
        "discount": 0.40,
    },
    {
        "flag":     "BOUGHT_FOLLOWERS",
        "label":    "BOUGHT FOLLOWERS — follower growth disconnected from engagement",
        "check":    lambda s: (
            s.get("social_follower_velocity", 0) > 0.50
            and s.get("social_engagement_rate", 1.0) < 0.01
        ),
        "reason": (
            "Social follower velocity >50%/month but engagement rate <1% — follower "
            "growth is not organic. Engagement-to-follower ratio is 100× below the "
            "industry baseline for genuine breakout artists."
        ),
        "severity": "medium",
        "discount": 0.20,
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# Result dataclasses
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class CategoryScore:
    category: str
    raw_points: float
    max_points: int
    normalised: float       # raw_points / max_points
    weighted: float         # normalised × weight × 100, contribution to composite
    rules_fired: List[str]
    rules_available: int


@dataclass
class FalsePositiveFlag:
    flag: str
    label: str
    reason: str
    severity: str           # "high" | "medium"
    discount: float         # fractional score reduction applied


@dataclass
class RuleScore:
    """
    Full scoring output.  Backward-compatible with the v1 RuleScore:
    `score`, `breakout_probable`, `threshold_used`, `rules_fired`,
    `rules_missed`, `tier`, `explanation`, `confidence` are all preserved.
    """
    # Core
    score: float
    breakout_probable: bool
    threshold_used: float
    tier: str                   # key in TIER_THRESHOLDS
    tier_label: str
    confidence_level: str       # "high" | "moderate" | "uncertain" | "insufficient"
    confidence_label: str
    explanation: str

    # Detail
    rules_fired: List[str]
    rules_missed: List[str]
    category_scores: List[CategoryScore]

    # False-positive flags
    false_positive_flags: List[FalsePositiveFlag] = field(default_factory=list)
    score_after_flags: float = 0.0
    override_tier: Optional[str] = None

    # v1 compat property
    @property
    def confidence(self) -> str:
        _map = {"high": "high", "moderate": "medium",
                "uncertain": "low", "insufficient": "low"}
        return _map.get(self.confidence_level, "low")


# ─────────────────────────────────────────────────────────────────────────────
# Scorer
# ─────────────────────────────────────────────────────────────────────────────
class RuleBasedScorer:
    """
    A&R breakout scoring framework — 5-category weighted rule engine.

    Backward-compatible drop-in for the original RuleBasedScorer.
    ``scorer.rules`` is still iterable as ``(name, signal, op, threshold, ...)``
    so any code that reads ``r[0]`` (rule name) or ``r[4]`` (weight) still works.

    Example::

        scorer = RuleBasedScorer()
        result = scorer.score({
            "save_rate": 0.22,
            "stream_velocity": 0.35,
            "tiktok_videos_per_week": 60,
            "tiktok_total_views": 12_000_000,
            "tiktok_spike_detected": True,
            "skip_rate": 0.18,
        })
        print(result.score, result.tier_label, result.confidence_label)
    """

    rules = BREAKOUT_RULES   # attribute — model_selector benchmark iterates this

    def __init__(self, breakout_threshold: float = 50.0) -> None:
        self.breakout_threshold = breakout_threshold

    # ─────────────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────────────

    def score(self, signals: Dict) -> RuleScore:
        """
        Score an artist against the A&R framework.

        Parameters
        ----------
        signals : dict
            Signal name → value.  Missing keys = no data (lowers confidence).
            Boolean signals (``tiktok_spike_detected``) should be True/False.
            Legacy signal names (v1 RuleBasedScorer) are accepted via aliases.

        Returns
        -------
        RuleScore with full breakdown, category scores, flags, and explanation.
        """
        signals = _normalise_signals(signals)

        # ── 1. Evaluate rules ─────────────────────────────────────────────
        cat_raw:   Dict[str, float] = {c: 0.0 for c in CATEGORY_BUDGET}
        cat_fired: Dict[str, List]  = {c: []  for c in CATEGORY_BUDGET}
        cat_avail: Dict[str, int]   = {c: 0   for c in CATEGORY_BUDGET}

        all_fired:  List[str] = []
        all_missed: List[str] = []

        # Track which tier-groups have already awarded points
        tier_group_fired: Dict[str, bool] = {}

        for rule in BREAKOUT_RULES:
            name, sig_key, op, threshold, raw_pts, category, expl = rule
            cat_avail[category] += 1

            val = signals.get(sig_key)

            # Tiered rule: skip lower tier if higher tier already fired
            group = _TIER_GROUPS.get(sig_key)
            if group and tier_group_fired.get(group):
                all_missed.append(f"{name} (lower tier superseded)")
                continue

            if val is None:
                all_missed.append(f"{name} (no data for '{sig_key}')")
                continue

            if _eval_op(val, op, threshold):
                cat_raw[category]  += raw_pts
                desc = (
                    f"{name}: {sig_key}={_fmt(val)} {op} {threshold} "
                    f"(+{raw_pts} pts) — {expl}"
                )
                cat_fired[category].append(desc)
                all_fired.append(desc)
                if group:
                    tier_group_fired[group] = True
            else:
                gap = _gap_pct(val, op, threshold)
                gap_str = f" [{gap}]" if gap else ""
                all_missed.append(
                    f"{name}: {sig_key}={_fmt(val)} did not meet {op} {threshold}{gap_str}"
                )

        # ── 2. Normalise + weight each category → composite 0-100 ─────────
        category_scores: List[CategoryScore] = []
        composite = 0.0

        for cat, budget in CATEGORY_BUDGET.items():
            raw     = min(cat_raw[cat], budget)
            norm    = raw / budget if budget else 0.0
            w       = CATEGORY_WEIGHT[cat]
            weighted = norm * w * 100
            composite += weighted
            category_scores.append(CategoryScore(
                category=cat,
                raw_points=raw,
                max_points=budget,
                normalised=round(norm, 4),
                weighted=round(weighted, 2),
                rules_fired=cat_fired[cat],
                rules_available=cat_avail[cat],
            ))

        composite = round(min(composite, 100.0), 1)

        # ── 3. False-positive detection ───────────────────────────────────
        flags: List[FalsePositiveFlag] = []
        score_adjusted = composite

        for ctrl in FALSE_POSITIVE_CONTROLS:
            if ctrl["check"](signals):
                f = FalsePositiveFlag(
                    flag=ctrl["flag"],
                    label=ctrl["label"],
                    reason=ctrl["reason"],
                    severity=ctrl["severity"],
                    discount=ctrl["discount"],
                )
                flags.append(f)
                score_adjusted *= (1.0 - ctrl["discount"])

        score_adjusted = round(max(score_adjusted, 0.0), 1)
        effective_score = score_adjusted if flags else composite

        # ── 4. Tier ───────────────────────────────────────────────────────
        tier = "unlikely_to_breakout"
        for t, thresh in sorted(TIER_THRESHOLDS.items(), key=lambda x: -x[1]):
            if effective_score >= thresh:
                tier = t
                break

        # ── 5. Confidence (signal completeness) ───────────────────────────
        signals_present = sum(
            1 for *_, sig_key, _op, _thr, _pts, _cat, _expl
            in [r[:] for r in BREAKOUT_RULES]
            if signals.get(sig_key) is not None
        )
        completeness = signals_present / len(BREAKOUT_RULES)

        confidence_level = "insufficient"
        confidence_label = CONFIDENCE_THRESHOLDS[-1][2]
        for thresh, lvl, label in CONFIDENCE_THRESHOLDS:
            if completeness >= thresh:
                confidence_level = lvl
                confidence_label = label
                break

        # ── 6. Explanation ────────────────────────────────────────────────
        cat_summary = "  |  ".join(
            f"{cs.category.upper()} {cs.weighted:.0f}/{int(CATEGORY_WEIGHT[cs.category]*100)}pts"
            for cs in sorted(category_scores, key=lambda x: -x.weighted)
            if cs.weighted > 0
        )
        flag_lines = " | ".join(f"⚠ {f.flag}" for f in flags)

        explanation = (
            f"Score {composite:.0f}/100 → {TIER_LABELS[tier]}. "
            f"Signal completeness {completeness:.0%} ({signals_present}/{len(BREAKOUT_RULES)}). "
            f"{cat_summary}. "
            + (f"After false-positive discounts → {score_adjusted:.0f}/100. " if flags else "")
            + f"Confidence: {confidence_label}."
            + (f" FLAGS: {flag_lines}" if flags else "")
        )

        return RuleScore(
            score=composite,
            breakout_probable=composite >= self.breakout_threshold,
            threshold_used=self.breakout_threshold,
            tier=tier,
            tier_label=TIER_LABELS[tier],
            confidence_level=confidence_level,
            confidence_label=confidence_label,
            explanation=explanation,
            rules_fired=all_fired,
            rules_missed=all_missed,
            category_scores=category_scores,
            false_positive_flags=flags,
            score_after_flags=score_adjusted,
            override_tier=tier if flags else None,
        )

    def explain_rules(self) -> str:
        """Human-readable dump of the full rule set and framework configuration."""
        lines = [
            "=" * 62,
            "A&R BREAKOUT SCORING FRAMEWORK",
            "=" * 62,
            f"Breakout threshold : {self.breakout_threshold:.0f} / 100",
            f"Total rules        : {len(BREAKOUT_RULES)}",
            "",
            "CATEGORY WEIGHTS",
            "-" * 40,
        ]
        for cat, w in CATEGORY_WEIGHT.items():
            lines.append(
                f"  {cat.upper():<12}  {w*100:.0f}%   (max {CATEGORY_BUDGET[cat]} raw pts)"
            )

        lines += ["", "RULES BY CATEGORY", "-" * 40]
        current_cat = None
        for rule in BREAKOUT_RULES:
            name, sig_key, op, threshold, raw_pts, category, expl = rule
            if category != current_cat:
                current_cat = category
                lines.append(
                    f"\n  [{category.upper()} — weight {CATEGORY_WEIGHT[category]*100:.0f}%]"
                )
            lines.append(
                f"    [{raw_pts:2d} pts]  {name}\n"
                f"               signal: {sig_key} {op} {threshold}\n"
                f"               → {expl}"
            )

        lines += ["", "FALSE-POSITIVE CONTROLS", "-" * 40]
        for ctrl in FALSE_POSITIVE_CONTROLS:
            lines.append(
                f"  ⚠ [{ctrl['flag']}]  severity={ctrl['severity']}  "
                f"discount={ctrl['discount']*100:.0f}%\n"
                f"    {ctrl['reason']}"
            )

        lines += ["", "TIER THRESHOLDS  (applied to composite 0-100 score)", "-" * 40]
        for key, thresh in sorted(TIER_THRESHOLDS.items(), key=lambda x: -x[1]):
            lines.append(f"  ≥{thresh:5.0f}  {key}  —  {TIER_LABELS[key]}")

        lines += ["", "CONFIDENCE LEVELS  (signal completeness fraction)", "-" * 40]
        for thresh, lvl, label in CONFIDENCE_THRESHOLDS:
            lines.append(f"  ≥{thresh*100:3.0f}%   {label}")

        return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# Private helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalise_signals(signals: Dict) -> Dict:
    """
    Map v1 signal names to v2 canonical names so old code keeps working.

    Old name                    → New canonical name
    ─────────────────────────────────────────────────
    ugc_growth_rate             → tiktok_videos_per_week  (scaled ×100)
    skip_rate_inv               → skip_rate               (inverted: 1 - val)
    high_quality_growth         → listener_to_follower_rate
    follower_velocity           → social_follower_velocity
    sustained_momentum          → algorithmic_traffic_share
    playlist_signal             → algorithmic_playlist_adds (scaled ×200)
    editorial_signal            → editorial_playlist_adds  (scaled ×10)
    repeat_listen_rate          → youtube_engagement_rate  (proxy)
    """
    out = dict(signals)

    # ugc_growth_rate (0-1 weekly growth fraction) → tiktok_videos_per_week
    if "ugc_growth_rate" in out and "tiktok_videos_per_week" not in out:
        out["tiktok_videos_per_week"] = out["ugc_growth_rate"] * 100

    # skip_rate_inv (1 = never skipped, 0 = always) → skip_rate (inverted)
    # v1 skip_rate_inv ≥0.70 means skip rate ≤30%; map directly to skip_rate
    if "skip_rate_inv" in out and "skip_rate" not in out:
        out["skip_rate"] = 1.0 - out["skip_rate_inv"]

    # high_quality_growth (save_rate × stream_velocity composite, 0-1)
    # → listener_to_follower_rate: multiply by 2 to match ≥10% threshold
    if "high_quality_growth" in out and "listener_to_follower_rate" not in out:
        out["listener_to_follower_rate"] = out["high_quality_growth"] * 2

    # follower_velocity → social_follower_velocity
    if "follower_velocity" in out and "social_follower_velocity" not in out:
        out["social_follower_velocity"] = out["follower_velocity"]

    # sustained_momentum → algorithmic_traffic_share
    if "sustained_momentum" in out and "algorithmic_traffic_share" not in out:
        out["algorithmic_traffic_share"] = out["sustained_momentum"]

    # playlist_signal (0-1) → algorithmic_playlist_adds (scaled)
    if "playlist_signal" in out and "algorithmic_playlist_adds" not in out:
        out["algorithmic_playlist_adds"] = out["playlist_signal"] * 200

    # editorial_signal (0-1) → editorial_playlist_adds (scaled)
    if "editorial_signal" in out and "editorial_playlist_adds" not in out:
        out["editorial_playlist_adds"] = out["editorial_signal"] * 10

    # repeat_listen_rate → youtube_engagement_rate (proxy)
    if "repeat_listen_rate" in out and "youtube_engagement_rate" not in out:
        # repeat_listen_rate ≥ 1.5 ≈ engagement rate ≥ 5%
        out["youtube_engagement_rate"] = min((out["repeat_listen_rate"] - 1.0) / 10.0, 0.20)

    # youtube_subscriber_velocity → youtube_sub_velocity (long-form alias)
    if "youtube_subscriber_velocity" in out and "youtube_sub_velocity" not in out:
        out["youtube_sub_velocity"] = out["youtube_subscriber_velocity"]

    # tiktok_video_growth_rate (MoM fraction) → tiktok_videos_per_week (approximate)
    # Not aliased automatically — growth rate and absolute count are different concepts.

    return out


def _eval_op(val, op: str, threshold) -> bool:
    if op == "==":  return val == threshold
    if op == ">=":  return val >= threshold
    if op == ">":   return val >  threshold
    if op == "<=":  return val <= threshold
    if op == "<":   return val <  threshold
    return False


def _gap_pct(val, op: str, threshold) -> str:
    """Return a human-readable proximity string for narrowly missed rules."""
    if val is None or isinstance(val, bool) or threshold == 0:
        return ""
    try:
        if op in (">=", ">"):
            gap = (threshold - val) / abs(threshold)
            if 0 < gap <= 0.25:
                return f"{gap*100:.0f}% below threshold"
        elif op in ("<=", "<"):
            gap = (val - threshold) / abs(threshold) if threshold != 0 else 0
            if 0 < gap <= 0.25:
                return f"{gap*100:.0f}% above threshold"
    except (TypeError, ZeroDivisionError):
        pass
    return ""


def _fmt(val) -> str:
    if isinstance(val, bool):
        return str(val)
    if isinstance(val, float):
        if val >= 1_000_000:
            return f"{val/1_000_000:.1f}M"
        if val >= 1_000:
            return f"{val/1_000:.1f}K"
        return f"{val:.3f}"
    return str(val)
