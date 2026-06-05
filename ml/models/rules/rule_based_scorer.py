from dataclasses import dataclass, field
from typing import List


@dataclass
class RuleScore:
    score: float                    # 0-100 composite score
    breakout_probable: bool         # True if score >= threshold
    threshold_used: float
    rules_fired: List[str]          # which rules triggered
    rules_missed: List[str]         # which rules did NOT trigger (missing signals)
    tier: str                       # "strong_breakout" | "probable_breakout" | "monitor" | "no_signal"
    explanation: str
    confidence: str                 # "high" | "medium" | "low"


# Each rule: (name, signal, operator, threshold, weight, explanation)
BREAKOUT_RULES = [
    # CRITICAL RULES (validated by industry research)
    ("save_rate_committed_fans",    "save_rate",       ">=", 0.15, 25,
     "Save rate >=15% = committed fans (Spotify for Artists benchmark)"),
    ("stream_velocity_breakout",    "stream_velocity", ">=", 0.25, 20,
     "Stream velocity >=25%/month = breakout trajectory (DSP analytics benchmark)"),
    ("tiktok_viral_signal",         "ugc_growth_rate", ">=", 0.50, 20,
     "UGC growth >=50%/week = TikTok viral moment (84% of Billboard Global 200 went TikTok-first)"),

    # HIGH-VALUE RULES
    ("high_quality_growth",         "high_quality_growth", ">", 0.05, 15,
     "save_rate x stream_velocity > 0.05 = high-quality fan growth"),
    ("follower_acceleration",       "follower_velocity", ">=", 0.10, 10,
     "Follower velocity >=10%/week = 21-day leading indicator for chart entry"),
    ("sustained_momentum",          "sustained_momentum", ">=", 0.25, 10,
     ">=3 weeks of sustained momentum (>15%/week growth) = not a one-time spike"),

    # SUPPORTING RULES
    ("playlist_signal",             "playlist_signal", ">=", 0.20, 8,
     "Playlist signal >=0.20 = editorial curators have noticed"),
    ("organic_not_algorithmic",     "editorial_signal", ">=", 0.40, 7,
     "Editorial traffic >=40% = organic discovery, not just DSP push"),
    ("low_skip_rate",               "skip_rate_inv",   ">=", 0.70, 5,
     "Skip rate <30% = track is retaining listeners"),
    ("repeat_listeners",            "repeat_listen_rate", ">=", 1.5, 5,
     "Listeners averaging >=1.5 plays = returning audience"),
]

# Tier thresholds
TIER_THRESHOLDS = {
    "strong_breakout":   75,
    "probable_breakout": 50,
    "monitor":           25,
    "no_signal":         0,
}


class RuleBasedScorer:
    def __init__(self, breakout_threshold: float = 50.0):
        self.breakout_threshold = breakout_threshold
        self.rules = BREAKOUT_RULES

    def score(self, signals: dict) -> RuleScore:
        total_score = 0.0
        fired = []
        missed = []

        for name, signal, op, threshold, weight, explanation in self.rules:
            val = signals.get(signal)
            if val is None:
                missed.append(f"{name} (missing: {signal})")
                continue

            triggered = (
                (op == ">=" and val >= threshold) or
                (op == ">"  and val >  threshold) or
                (op == "<=" and val <= threshold) or
                (op == "<"  and val <  threshold)
            )

            if triggered:
                total_score += weight
                fired.append(f"{name}: {signal}={val:.3f} {op} {threshold} (+{weight} pts) — {explanation}")

        # Tier classification
        tier = "no_signal"
        for t, t_thresh in sorted(TIER_THRESHOLDS.items(), key=lambda x: -x[1]):
            if total_score >= t_thresh:
                tier = t
                break

        breakout_probable = total_score >= self.breakout_threshold

        # Confidence based on available signals
        available = sum(1 for _, sig, *_ in self.rules if signals.get(sig) is not None)
        confidence = "high" if available >= 7 else "medium" if available >= 4 else "low"

        explanation_text = (
            f"Rule-based score: {total_score:.0f}/100 (threshold={self.breakout_threshold}). "
            f"Tier: {tier}. {len(fired)}/{len(self.rules)} rules fired. "
            + ("BREAKOUT PROBABLE. " if breakout_probable else "Not yet breakout signal. ")
            + f"Top rules: {'; '.join(r.split('—')[0].strip() for r in fired[:3]) or 'none fired'}."
        )

        return RuleScore(
            score=round(total_score, 1),
            breakout_probable=breakout_probable,
            threshold_used=self.breakout_threshold,
            rules_fired=fired,
            rules_missed=missed,
            tier=tier,
            explanation=explanation_text,
            confidence=confidence,
        )

    def explain_rules(self) -> str:
        """Return human-readable rule set."""
        lines = ["=== Rule-Based Breakout Scorer ===", f"Breakout threshold: {self.breakout_threshold} points", ""]
        total_possible = sum(w for *_, w, _ in self.rules)
        lines.append(f"Rules ({len(self.rules)} total, {total_possible} max points):")
        for name, signal, op, threshold, weight, expl in sorted(self.rules, key=lambda r: -r[4]):
            lines.append(f"  [{weight:2d} pts] {name}: {signal} {op} {threshold}")
            lines.append(f"           -> {expl}")
        return "\n".join(lines)
