"""TrendAnalysisEngine — orchestrates the full time-series analysis pipeline."""

from datetime import datetime, timezone

from .types import TrendAnalysisResult
from .trend_detector import TrendDetector
from .spike_detector import SpikeDetector
from .leading_indicators import LeadingIndicatorAnalyzer
from .forecaster import BreakoutForecaster
from .risk_analyzer import RiskAnalyzer


class TrendAnalysisEngine:
    """Orchestrates the complete trend analysis pipeline for artist breakout detection."""

    def __init__(self):
        self._trend_detector = TrendDetector()
        self._spike_detector = SpikeDetector()
        self._leading_analyzer = LeadingIndicatorAnalyzer()
        self._forecaster = BreakoutForecaster()
        self._risk_analyzer = RiskAnalyzer()

    def analyze(
        self,
        artist_id: int,
        artist_name: str,
        snapshots: list[dict],
        prediction_date: str,
    ) -> TrendAnalysisResult:
        """Run the full 10-step trend analysis pipeline."""

        analyzed_at = datetime.now(timezone.utc).isoformat()

        # Step 1: Temporal leakage check
        all_count = len(snapshots)
        filtered = [s for s in snapshots if s.get("date", "") <= prediction_date]
        dropped = all_count - len(filtered)

        if dropped > 0:
            leakage_check = f"warning: {dropped} snapshot(s) dropped (date > {prediction_date})"
        else:
            leakage_check = "passed"

        # Step 2: Sort by date ascending
        filtered.sort(key=lambda x: x.get("date", ""))
        data_points_used = len(filtered)

        # Step 3: Compute rolling stats for all signals
        rolling_stats_list = self._trend_detector.compute_all_rolling_stats(filtered, prediction_date)
        rolling_stats_map = {rs.signal: rs for rs in rolling_stats_list}

        # Step 4: Detect regime changes for all signals
        all_regime_changes = []
        for signal in rolling_stats_map:
            changes = self._trend_detector.detect_regime_changes(filtered, signal, prediction_date)
            all_regime_changes.extend(changes)

        # Step 5: Detect spikes for all signals
        all_spikes = []
        for signal in rolling_stats_map:
            spikes = self._spike_detector.detect_spikes(filtered, signal, prediction_date, z_threshold=2.0)
            all_spikes.extend(spikes)

        # Step 6: Analyze leading indicators
        leading_indicators = self._leading_analyzer.analyze(filtered, prediction_date)

        # Step 7: Forecast 30-day
        forecast_30d = self._forecaster.forecast(
            rolling_stats_map=rolling_stats_map,
            spike_events=all_spikes,
            horizon_days=30,
            data_points=data_points_used,
        )

        # Step 8: Forecast 90-day
        forecast_90d = self._forecaster.forecast(
            rolling_stats_map=rolling_stats_map,
            spike_events=all_spikes,
            horizon_days=90,
            data_points=data_points_used,
        )

        # Step 9: Assess risk factors
        risk_factors = self._risk_analyzer.analyze(rolling_stats_map, all_spikes, forecast_30d)

        # Step 10: Suggest monitoring signals
        monitoring_signals = self._risk_analyzer.suggest_monitoring(rolling_stats_map, leading_indicators)

        return TrendAnalysisResult(
            artist_id=artist_id,
            artist_name=artist_name,
            prediction_date=prediction_date,
            rolling_stats=rolling_stats_list,
            spike_events=all_spikes,
            leading_indicators=leading_indicators,
            regime_changes=all_regime_changes,
            forecast_30d=forecast_30d,
            forecast_90d=forecast_90d,
            risk_factors=risk_factors,
            monitoring_signals=monitoring_signals,
            data_points_used=data_points_used,
            temporal_leakage_check=leakage_check,
            analyzed_at=analyzed_at,
        )
