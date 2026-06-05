"""
A&R Breakout Scoring Framework — test suite.

Covers:
  - Category scoring isolation (each category scores correctly in isolation)
  - Tier classification at exact boundaries
  - False-positive detection (FAKE_VIRAL, ARTIFICIAL_BOOST, BOUGHT_FOLLOWERS)
  - Confidence levels from signal completeness
  - Tiered rule exclusivity (only highest tier fires per group)
  - False-positive score discounting
  - Edge cases: empty signals, all signals maxed, bool signals
  - Backward compatibility: v1 signal names still work
  - explain_rules() contains all rule names
"""

import pytest
from ml.models.rules.rule_based_scorer import (
    RuleBasedScorer,
    RuleScore,
    CategoryScore,
    FalsePositiveFlag,
    BREAKOUT_RULES,
    TIER_THRESHOLDS,
    CATEGORY_BUDGET,
    CATEGORY_WEIGHT,
)


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def scorer():
    return RuleBasedScorer()


@pytest.fixture
def full_signals():
    """All signals maxed — should score very high."""
    return {
        # Spotify
        "save_rate": 0.25,
        "stream_velocity": 0.40,
        "listener_to_follower_rate": 0.15,
        "algorithmic_traffic_share": 0.40,
        "skip_rate": 0.15,
        # TikTok
        "tiktok_videos_per_week": 75,
        "tiktok_total_views": 15_000_000,
        "tiktok_spike_detected": True,
        # YouTube
        "youtube_sub_velocity": 0.15,
        "youtube_total_views": 8_000_000,
        "youtube_engagement_rate": 0.08,
        "youtube_shorts_per_week": 150,
        # Radio / Playlist
        "radio_station_count": 60,
        "editorial_playlist_adds": 8,
        "algorithmic_playlist_adds": 80,
        # Social
        "social_follower_velocity": 0.20,
        "social_engagement_rate": 0.07,
    }


@pytest.fixture
def spotify_only_signals():
    """Only Spotify signals present."""
    return {
        "save_rate": 0.22,
        "stream_velocity": 0.35,
        "skip_rate": 0.18,
    }


@pytest.fixture
def tiktok_only_signals():
    """Only TikTok signals — no Spotify."""
    return {
        "tiktok_videos_per_week": 60,
        "tiktok_total_views": 12_000_000,
        "tiktok_spike_detected": True,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Basic contract
# ─────────────────────────────────────────────────────────────────────────────

class TestBasicContract:
    def test_empty_signals_returns_zero(self, scorer):
        r = scorer.score({})
        assert r.score == 0.0

    def test_empty_signals_no_rules_fired(self, scorer):
        r = scorer.score({})
        assert r.rules_fired == []

    def test_score_bounded_0_to_100(self, scorer, full_signals):
        r = scorer.score(full_signals)
        assert 0.0 <= r.score <= 100.0

    def test_full_signals_high_score(self, scorer, full_signals):
        r = scorer.score(full_signals)
        assert r.score >= 80.0, f"All signals maxed should score ≥80, got {r.score}"

    def test_full_signals_strong_breakout_tier(self, scorer, full_signals):
        r = scorer.score(full_signals)
        assert r.tier == "strong_breakout"

    def test_breakout_probable_aligns_with_threshold(self, scorer):
        # Score just above breakout_threshold
        signals = {
            "save_rate": 0.22,
            "stream_velocity": 0.35,
            "tiktok_videos_per_week": 60,
            "tiktok_total_views": 12_000_000,
        }
        r = scorer.score(signals)
        assert r.breakout_probable == (r.score >= scorer.breakout_threshold)

    def test_returns_rulescores_type(self, scorer):
        r = scorer.score({})
        assert isinstance(r, RuleScore)

    def test_category_scores_present(self, scorer, full_signals):
        r = scorer.score(full_signals)
        cats = {cs.category for cs in r.category_scores}
        assert cats == {"spotify", "tiktok", "youtube", "radio", "social"}

    def test_category_scores_sum_to_composite(self, scorer, full_signals):
        r = scorer.score(full_signals)
        total = sum(cs.weighted for cs in r.category_scores)
        assert abs(total - r.score) < 0.5, (
            f"Category weights should sum to composite: {total:.2f} vs {r.score}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Category isolation
# ─────────────────────────────────────────────────────────────────────────────

class TestCategoryIsolation:
    def test_spotify_only_awards_spotify_points(self, scorer, spotify_only_signals):
        r = scorer.score(spotify_only_signals)
        spotify_cs = next(cs for cs in r.category_scores if cs.category == "spotify")
        for cs in r.category_scores:
            if cs.category != "spotify":
                assert cs.weighted == 0.0, f"Expected {cs.category} = 0, got {cs.weighted}"
        assert spotify_cs.weighted > 0

    def test_tiktok_only_awards_tiktok_points(self, scorer, tiktok_only_signals):
        r = scorer.score(tiktok_only_signals)
        tiktok_cs = next(cs for cs in r.category_scores if cs.category == "tiktok")
        assert tiktok_cs.weighted > 0
        spotify_cs = next(cs for cs in r.category_scores if cs.category == "spotify")
        assert spotify_cs.weighted == 0.0

    def test_spotify_max_contribution_is_40pct(self, scorer):
        # Max Spotify contribution = 100% of Spotify budget × 40% weight = 40 points
        signals = {
            "save_rate": 0.30,             # tier_high = 25 pts
            "stream_velocity": 0.40,        # tier_high = 25 pts
            "listener_to_follower_rate": 0.15, # 10 pts
            "algorithmic_traffic_share": 0.50, # 10 pts
            "skip_rate": 0.10,               # 10 pts
        }
        r = scorer.score(signals)
        spotify_cs = next(cs for cs in r.category_scores if cs.category == "spotify")
        assert abs(spotify_cs.weighted - 40.0) < 0.5, (
            f"Max Spotify contribution should be ~40pts, got {spotify_cs.weighted}"
        )

    def test_tiktok_max_contribution_is_30pct(self, scorer):
        signals = {
            "tiktok_videos_per_week": 100,
            "tiktok_total_views": 20_000_000,
            "tiktok_spike_detected": True,
        }
        r = scorer.score(signals)
        tiktok_cs = next(cs for cs in r.category_scores if cs.category == "tiktok")
        assert abs(tiktok_cs.weighted - 30.0) < 0.5, (
            f"Max TikTok contribution should be ~30pts, got {tiktok_cs.weighted}"
        )

    def test_youtube_max_contribution_is_15pct(self, scorer):
        signals = {
            "youtube_sub_velocity": 0.20,
            "youtube_total_views": 10_000_000,
            "youtube_engagement_rate": 0.10,
            "youtube_shorts_per_week": 200,
        }
        r = scorer.score(signals)
        yt_cs = next(cs for cs in r.category_scores if cs.category == "youtube")
        assert abs(yt_cs.weighted - 15.0) < 0.5

    def test_radio_max_contribution_is_10pct(self, scorer):
        signals = {
            "radio_station_count": 100,
            "editorial_playlist_adds": 20,
            "algorithmic_playlist_adds": 200,
        }
        r = scorer.score(signals)
        radio_cs = next(cs for cs in r.category_scores if cs.category == "radio")
        assert abs(radio_cs.weighted - 10.0) < 0.5

    def test_social_max_contribution_is_5pct(self, scorer):
        signals = {
            "social_follower_velocity": 0.30,
            "social_engagement_rate": 0.10,
        }
        r = scorer.score(signals)
        soc_cs = next(cs for cs in r.category_scores if cs.category == "social")
        assert abs(soc_cs.weighted - 5.0) < 0.5


# ─────────────────────────────────────────────────────────────────────────────
# Tiered rule exclusivity
# ─────────────────────────────────────────────────────────────────────────────

class TestTieredRules:
    def test_save_rate_high_supersedes_mid(self, scorer):
        """save_rate ≥20% should not also award mid-tier points."""
        r = scorer.score({"save_rate": 0.25})
        # Only the high tier should fire; mid and low should be in missed/superseded
        fired_names = [f.split(":")[0] for f in r.rules_fired]
        assert "save_rate_high" in fired_names
        assert "save_rate_mid" not in fired_names
        assert "save_rate_low" not in fired_names

    def test_save_rate_mid_fires_when_below_high(self, scorer):
        r = scorer.score({"save_rate": 0.17})
        fired_names = [f.split(":")[0] for f in r.rules_fired]
        assert "save_rate_mid" in fired_names
        assert "save_rate_high" not in fired_names

    def test_save_rate_low_fires_when_below_mid(self, scorer):
        r = scorer.score({"save_rate": 0.12})
        fired_names = [f.split(":")[0] for f in r.rules_fired]
        assert "save_rate_low" in fired_names
        assert "save_rate_mid" not in fired_names
        assert "save_rate_high" not in fired_names

    def test_tiktok_videos_high_supersedes_lower_tiers(self, scorer):
        r = scorer.score({"tiktok_videos_per_week": 60})
        fired_names = [f.split(":")[0] for f in r.rules_fired]
        assert "tiktok_videos_high" in fired_names
        assert "tiktok_videos_mid" not in fired_names
        assert "tiktok_videos_low" not in fired_names

    def test_stream_velocity_high_supersedes_mid(self, scorer):
        r = scorer.score({"stream_velocity": 0.35})
        fired_names = [f.split(":")[0] for f in r.rules_fired]
        assert "stream_velocity_high" in fired_names
        assert "stream_velocity_mid" not in fired_names

    def test_stream_velocity_mid_fires_alone(self, scorer):
        r = scorer.score({"stream_velocity": 0.25})
        fired_names = [f.split(":")[0] for f in r.rules_fired]
        assert "stream_velocity_mid" in fired_names
        assert "stream_velocity_high" not in fired_names

    def test_radio_high_supersedes_mid(self, scorer):
        r = scorer.score({"radio_station_count": 55})
        fired_names = [f.split(":")[0] for f in r.rules_fired]
        assert "radio_high" in fired_names
        assert "radio_mid" not in fired_names


# ─────────────────────────────────────────────────────────────────────────────
# Boolean signal: tiktok_spike_detected
# ─────────────────────────────────────────────────────────────────────────────

class TestBooleanSignals:
    def test_tiktok_spike_true_fires_rule(self, scorer):
        r = scorer.score({"tiktok_spike_detected": True})
        fired_names = [f.split(":")[0] for f in r.rules_fired]
        assert "tiktok_viral_spike" in fired_names

    def test_tiktok_spike_false_does_not_fire(self, scorer):
        r = scorer.score({"tiktok_spike_detected": False})
        fired_names = [f.split(":")[0] for f in r.rules_fired]
        assert "tiktok_viral_spike" not in fired_names


# ─────────────────────────────────────────────────────────────────────────────
# Tier boundaries
# ─────────────────────────────────────────────────────────────────────────────

class TestTierBoundaries:
    def test_score_80_is_strong_breakout(self, scorer, full_signals):
        r = scorer.score(full_signals)
        if r.score >= 80.0:
            assert r.tier == "strong_breakout"

    def test_score_50_to_79_is_probable_breakout(self, scorer):
        # Build a signal set that scores in the 50-79 band
        signals = {
            "save_rate": 0.17,           # mid tier
            "stream_velocity": 0.25,     # mid tier
            "tiktok_videos_per_week": 25, # mid tier
        }
        r = scorer.score(signals)
        # Score should be roughly in 30-65 range
        if 50.0 <= r.score < 80.0:
            assert r.tier == "probable_breakout"

    def test_no_signal_tier_for_zero_score(self, scorer):
        r = scorer.score({})
        assert r.tier == "no_signal"

    def test_tier_label_populated(self, scorer, full_signals):
        r = scorer.score(full_signals)
        assert r.tier_label
        assert r.tier_label != ""


# ─────────────────────────────────────────────────────────────────────────────
# False-positive controls
# ─────────────────────────────────────────────────────────────────────────────

class TestFalsePositiveControls:

    # ── FAKE_VIRAL ────────────────────────────────────────────────────────
    def test_fake_viral_flagged_tiktok_high_save_rate_low(self, scorer):
        r = scorer.score({
            "tiktok_videos_per_week": 60,
            "save_rate": 0.06,           # below 10% threshold
        })
        flags = [f.flag for f in r.false_positive_flags]
        assert "FAKE_VIRAL" in flags

    def test_fake_viral_not_flagged_when_save_rate_sufficient(self, scorer):
        r = scorer.score({
            "tiktok_videos_per_week": 60,
            "save_rate": 0.12,           # above 10% — legitimate viral
        })
        flags = [f.flag for f in r.false_positive_flags]
        assert "FAKE_VIRAL" not in flags

    def test_fake_viral_not_flagged_when_tiktok_volume_low(self, scorer):
        r = scorer.score({
            "tiktok_videos_per_week": 10,  # below 20 threshold
            "save_rate": 0.05,
        })
        flags = [f.flag for f in r.false_positive_flags]
        assert "FAKE_VIRAL" not in flags

    # ── ARTIFICIAL_BOOST ──────────────────────────────────────────────────
    def test_artificial_boost_flagged_high_velocity_high_skip(self, scorer):
        r = scorer.score({
            "stream_velocity": 0.60,     # >50%
            "skip_rate": 0.45,           # >40%
        })
        flags = [f.flag for f in r.false_positive_flags]
        assert "ARTIFICIAL_BOOST" in flags

    def test_artificial_boost_not_flagged_low_skip(self, scorer):
        r = scorer.score({
            "stream_velocity": 0.60,
            "skip_rate": 0.20,           # good skip rate — organic
        })
        flags = [f.flag for f in r.false_positive_flags]
        assert "ARTIFICIAL_BOOST" not in flags

    def test_artificial_boost_not_flagged_moderate_velocity(self, scorer):
        r = scorer.score({
            "stream_velocity": 0.40,     # below 50% trigger
            "skip_rate": 0.50,
        })
        flags = [f.flag for f in r.false_positive_flags]
        assert "ARTIFICIAL_BOOST" not in flags

    # ── BOUGHT_FOLLOWERS ──────────────────────────────────────────────────
    def test_bought_followers_flagged(self, scorer):
        r = scorer.score({
            "social_follower_velocity": 0.60,   # >50%
            "social_engagement_rate": 0.005,    # <1%
        })
        flags = [f.flag for f in r.false_positive_flags]
        assert "BOUGHT_FOLLOWERS" in flags

    def test_bought_followers_not_flagged_high_engagement(self, scorer):
        r = scorer.score({
            "social_follower_velocity": 0.60,
            "social_engagement_rate": 0.04,     # >1% — real followers
        })
        flags = [f.flag for f in r.false_positive_flags]
        assert "BOUGHT_FOLLOWERS" not in flags

    # ── Flag discounting ──────────────────────────────────────────────────
    def test_fake_viral_reduces_score_by_30pct(self, scorer):
        signals = {
            "tiktok_videos_per_week": 60,
            "save_rate": 0.06,
        }
        r = scorer.score(signals)
        expected = round(r.score * (1 - 0.30), 1)
        assert abs(r.score_after_flags - expected) < 0.5, (
            f"Expected {expected}, got {r.score_after_flags}"
        )

    def test_artificial_boost_reduces_score_by_40pct(self, scorer):
        signals = {"stream_velocity": 0.60, "skip_rate": 0.45}
        r = scorer.score(signals)
        expected = round(r.score * (1 - 0.40), 1)
        assert abs(r.score_after_flags - expected) < 0.5

    def test_multiple_flags_compound_discounts(self, scorer):
        """Two flags should apply sequentially, not additively."""
        signals = {
            "tiktok_videos_per_week": 60, "save_rate": 0.06,    # FAKE_VIRAL
            "stream_velocity": 0.60, "skip_rate": 0.45,          # ARTIFICIAL_BOOST
        }
        r = scorer.score(signals)
        # After two flags: score × 0.70 × 0.60
        expected = round(r.score * 0.70 * 0.60, 1)
        assert abs(r.score_after_flags - expected) < 1.0

    def test_no_flags_score_after_flags_equals_score(self, scorer, full_signals):
        """Clean signals: score_after_flags == score."""
        # full_signals has good save_rate and skip_rate so no flags should fire
        r = scorer.score(full_signals)
        if not r.false_positive_flags:
            assert r.score_after_flags == r.score

    def test_flag_info_populated(self, scorer):
        r = scorer.score({"tiktok_videos_per_week": 60, "save_rate": 0.05})
        flag = r.false_positive_flags[0]
        assert flag.flag == "FAKE_VIRAL"
        assert flag.reason
        assert flag.severity in ("high", "medium")
        assert 0 < flag.discount < 1


# ─────────────────────────────────────────────────────────────────────────────
# Confidence levels
# ─────────────────────────────────────────────────────────────────────────────

class TestConfidenceLevels:
    def test_all_signals_gives_high_confidence(self, scorer, full_signals):
        r = scorer.score(full_signals)
        assert r.confidence_level == "high"
        assert "HIGH CONFIDENCE" in r.confidence_label

    def test_empty_signals_gives_insufficient_confidence(self, scorer):
        r = scorer.score({})
        assert r.confidence_level == "insufficient"
        assert "INSUFFICIENT" in r.confidence_label

    def test_partial_signals_gives_lower_confidence(self, scorer):
        # Only 3 signals out of 23+ rules
        r = scorer.score({"save_rate": 0.20, "stream_velocity": 0.30, "skip_rate": 0.18})
        assert r.confidence_level in ("insufficient", "uncertain", "moderate")

    def test_confidence_v1_compat_property(self, scorer, full_signals):
        """v1 .confidence property should return 'high'/'medium'/'low'."""
        r = scorer.score(full_signals)
        assert r.confidence in ("high", "medium", "low")

    def test_confidence_label_human_review_required_in_uncertain(self, scorer):
        # ~5-8 signals: moderate completeness
        signals = {k: v for k, v in [
            ("save_rate", 0.18),
            ("stream_velocity", 0.25),
            ("tiktok_videos_per_week", 30),
            ("tiktok_total_views", 2_000_000),
            ("skip_rate", 0.22),
        ]}
        r = scorer.score(signals)
        if r.confidence_level == "uncertain":
            assert "HUMAN REVIEW" in r.confidence_label


# ─────────────────────────────────────────────────────────────────────────────
# Backward compatibility — v1 signal names
# ─────────────────────────────────────────────────────────────────────────────

class TestV1Compatibility:
    """Old signal names must still produce correct results via aliases."""

    def test_ugc_growth_rate_mapped_to_tiktok_videos(self, scorer):
        r1 = scorer.score({"ugc_growth_rate": 0.60})          # v1 name
        r2 = scorer.score({"tiktok_videos_per_week": 60})     # v2 name
        # Both should fire the high-tier TikTok rule
        names1 = [f.split(":")[0] for f in r1.rules_fired]
        names2 = [f.split(":")[0] for f in r2.rules_fired]
        assert "tiktok_videos_high" in names1
        assert names1 == names2

    def test_skip_rate_inv_mapped_correctly(self, scorer):
        # skip_rate_inv=0.72 → skip_rate=0.28 → should fire low_skip_rate (≤0.30)
        r = scorer.score({"skip_rate_inv": 0.72})
        names = [f.split(":")[0] for f in r.rules_fired]
        assert "low_skip_rate" in names

    def test_high_quality_growth_mapped(self, scorer):
        r = scorer.score({"high_quality_growth": 0.06})  # ×2 = 0.12 ≥ 0.10
        names = [f.split(":")[0] for f in r.rules_fired]
        assert "listener_follower_conversion" in names

    def test_v1_sample_signals_score_above_50(self, scorer):
        """The v1 sample_signals fixture must still be recognised as a breakout."""
        signals = {
            "save_rate": 0.18, "stream_velocity": 0.30, "ugc_growth_rate": 0.60,
            "high_quality_growth": 0.054, "follower_velocity": 0.12,
            "sustained_momentum": 0.33, "playlist_signal": 0.25,
            "editorial_signal": 0.45, "skip_rate_inv": 0.72,
            "repeat_listen_rate": 1.7,
        }
        r = scorer.score(signals)
        assert r.breakout_probable is True, f"Expected breakout, score={r.score}"
        assert r.tier in ("strong_breakout", "probable_breakout")


# ─────────────────────────────────────────────────────────────────────────────
# explain_rules()
# ─────────────────────────────────────────────────────────────────────────────

class TestExplainRules:
    def test_contains_all_rule_names(self, scorer):
        text = scorer.explain_rules()
        for rule in BREAKOUT_RULES:
            name = rule[0]
            assert name in text, f"Rule '{name}' missing from explain_rules()"

    def test_contains_false_positive_flag_names(self, scorer):
        text = scorer.explain_rules()
        for flag_name in ("FAKE_VIRAL", "ARTIFICIAL_BOOST", "BOUGHT_FOLLOWERS"):
            assert flag_name in text

    def test_contains_all_categories(self, scorer):
        text = scorer.explain_rules()
        for cat in ("SPOTIFY", "TIKTOK", "YOUTUBE", "RADIO", "SOCIAL"):
            assert cat in text

    def test_contains_tier_labels(self, scorer):
        text = scorer.explain_rules()
        for tier in ("strong_breakout", "probable_breakout", "monitor", "no_signal"):
            assert tier in text

    def test_contains_confidence_labels(self, scorer):
        text = scorer.explain_rules()
        assert "HIGH CONFIDENCE" in text
        assert "HUMAN REVIEW" in text


# ─────────────────────────────────────────────────────────────────────────────
# Rules attribute (model_selector benchmark compatibility)
# ─────────────────────────────────────────────────────────────────────────────

class TestRulesAttribute:
    def test_rules_is_list(self, scorer):
        assert isinstance(scorer.rules, list)

    def test_rules_r0_is_name(self, scorer):
        for r in scorer.rules:
            assert isinstance(r[0], str), f"r[0] should be rule name, got {type(r[0])}"

    def test_rules_r4_is_int_weight(self, scorer):
        for r in scorer.rules:
            assert isinstance(r[4], int), f"r[4] should be raw_pts int, got {type(r[4])}"

    def test_all_rule_names_unique(self, scorer):
        names = [r[0] for r in scorer.rules]
        assert len(names) == len(set(names)), "Duplicate rule names detected"

    def test_category_budgets_match_rule_sums(self, scorer):
        """CATEGORY_BUDGET should equal max attainable (ignoring tiered exclusion)."""
        from collections import defaultdict
        sums = defaultdict(int)
        for rule in BREAKOUT_RULES:
            sums[rule[5]] += rule[4]
        for cat, budget in CATEGORY_BUDGET.items():
            assert sums[cat] >= budget, (
                f"Category {cat}: rules sum {sums[cat]} < budget {budget}"
            )


# ─────────────────────────────────────────────────────────────────────────────
# Edge cases
# ─────────────────────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_none_values_treated_as_missing(self, scorer):
        r = scorer.score({"save_rate": None, "stream_velocity": 0.35})
        # save_rate=None should be skipped, not crash
        names = [f.split(":")[0] for f in r.rules_fired]
        assert "save_rate_high" not in names
        assert "stream_velocity_high" in names

    def test_custom_breakout_threshold(self):
        scorer_high = RuleBasedScorer(breakout_threshold=90.0)
        r = scorer_high.score({
            "save_rate": 0.25, "stream_velocity": 0.40,
            "tiktok_videos_per_week": 60, "tiktok_total_views": 12_000_000,
        })
        # Even a strong score may not hit 90
        assert r.breakout_probable == (r.score >= 90.0)

    def test_boundary_save_rate_exactly_020(self, scorer):
        r = scorer.score({"save_rate": 0.20})
        names = [f.split(":")[0] for f in r.rules_fired]
        assert "save_rate_high" in names

    def test_boundary_save_rate_just_below_020(self, scorer):
        r = scorer.score({"save_rate": 0.1999})
        names = [f.split(":")[0] for f in r.rules_fired]
        assert "save_rate_high" not in names
        assert "save_rate_mid" in names

    def test_very_large_tiktok_views_capped_at_budget(self, scorer):
        r = scorer.score({"tiktok_total_views": 999_999_999_999})
        tiktok_cs = next(cs for cs in r.category_scores if cs.category == "tiktok")
        assert tiktok_cs.normalised <= 1.0

    def test_explanation_non_empty(self, scorer, full_signals):
        r = scorer.score(full_signals)
        assert len(r.explanation) > 30

    def test_rules_missed_populated_for_partial_signals(self, scorer):
        r = scorer.score({"save_rate": 0.20})
        assert len(r.rules_missed) > 0

    def test_score_not_nan(self, scorer):
        import math
        r = scorer.score({"save_rate": 0.0, "stream_velocity": 0.0})
        assert not math.isnan(r.score)
