import time
import numpy as np
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List


class DataScenario(str, Enum):
    SMALL  = "small"   # < 500 artists
    MEDIUM = "medium"  # 500-2000 artists
    LARGE  = "large"   # > 2000 artists


class PriorityScenario(str, Enum):
    EXPLAINABILITY = "explainability"
    SPEED          = "speed"
    ACCURACY       = "accuracy"
    ROBUSTNESS     = "robustness"
    COLD_START     = "cold_start"   # no labeled data yet


@dataclass
class ModelSpec:
    name: str
    tier: str           # "baseline" | "production" | "advanced" | "fallback"
    algorithm: str
    min_training_samples: int
    training_time: str
    prediction_latency_ms: float
    interpretability: str   # "high" | "medium" | "low"
    robustness: str         # "high" | "medium" | "low"
    expected_auc_range: tuple
    deployment_complexity: str  # "low" | "medium" | "high"
    strengths: List[str]
    weaknesses: List[str]
    best_for: List[str]
    hyperparameters: dict
    feature_set: str    # "3_core" | "full_set" | "full_plus_temporal" | "none"
    module_path: str


@dataclass
class SelectionResult:
    scenario_description: str
    recommended_model: ModelSpec
    fallback_model: ModelSpec
    reasoning: str
    data_requirement_met: bool
    recommendation_matrix: List[dict]
    comparison_table: str


@dataclass
class BenchmarkResult:
    model_name: str
    n_samples: int
    auc: float
    precision_at_50pct_recall: float
    avg_prediction_ms: float
    notes: str


MODEL_REGISTRY = {
    "rule_based": ModelSpec(
        name="rule_based",
        tier="fallback",
        algorithm="Rule-based scoring",
        min_training_samples=0,
        training_time="0 seconds",
        prediction_latency_ms=0.1,
        interpretability="high",
        robustness="high",
        expected_auc_range=(0.65, 0.75),
        deployment_complexity="low",
        strengths=[
            "No training data required",
            "Fully explainable",
            "Never overfits",
            "Encodes domain expertise directly",
        ],
        weaknesses=[
            "Cannot learn from data",
            "Thresholds require manual calibration",
            "Misses non-linear interactions",
        ],
        best_for=[
            "Cold start (0 labeled artists)",
            "Explainability requirement",
            "Sanity check for ML models",
        ],
        hyperparameters={"breakout_threshold": 50},
        feature_set="3_core",
        module_path="ml.models.rules.rule_based_scorer.RuleBasedScorer",
    ),
    "logistic_regression": ModelSpec(
        name="logistic_regression",
        tier="baseline",
        algorithm="Logistic Regression (gradient descent)",
        min_training_samples=200,
        training_time="< 1 second",
        prediction_latency_ms=0.5,
        interpretability="high",
        robustness="high",
        expected_auc_range=(0.72, 0.80),
        deployment_complexity="low",
        strengths=[
            "Coefficient weights show feature importance directly",
            "No hyperparameter tuning required",
            "Works with 200+ samples",
            "No overfitting risk with 3 features",
        ],
        weaknesses=[
            "Assumes linear relationship between features and log-odds",
            "Cannot capture interaction effects beyond explicit interaction features",
            "No handling of missing values (requires imputation)",
        ],
        best_for=[
            "Small data (<500 artists)",
            "Explainability requirement",
            "Speed requirement",
            "Sanity-checking XGBoost predictions",
        ],
        hyperparameters={"lr": 0.01, "epochs": 500},
        feature_set="3_core",
        module_path="ml.models.baseline.logistic_model.LogisticBreakoutModel",
    ),
    "xgboost": ModelSpec(
        name="xgboost",
        tier="production",
        algorithm="XGBoost Gradient Boosting",
        min_training_samples=500,
        training_time="1-5 minutes",
        prediction_latency_ms=5.0,
        interpretability="medium",
        robustness="high",
        expected_auc_range=(0.82, 0.90),
        deployment_complexity="medium",
        strengths=[
            "Handles missing values natively",
            "Captures non-linear interactions automatically",
            "SHAP values for interpretability",
            "Best accuracy/interpretability tradeoff",
            "Robust to outliers",
            "scale_pos_weight handles class imbalance (11.5x for 8% viral rate)",
        ],
        weaknesses=[
            "Needs 500+ samples for stable feature importance",
            "Hyperparameter tuning required (n_estimators, max_depth, learning_rate)",
            "Not suitable if explainability is a hard requirement",
        ],
        best_for=[
            "Production deployment (500-2000 artists)",
            "Best accuracy/interpretability balance",
            "Full feature set with 43 engineered features",
        ],
        hyperparameters={
            "n_estimators": 300,
            "max_depth": 6,
            "learning_rate": 0.05,
            "scale_pos_weight": 11.5,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "min_child_weight": 5,
            "objective": "binary:logistic",
            "eval_metric": "auc",
        },
        feature_set="full_set",
        module_path="ml.models.xgboost_model.CalibratedViralXGBoost",
    ),
    "pytorch_tabular_nn": ModelSpec(
        name="pytorch_tabular_nn",
        tier="advanced",
        algorithm="PyTorch TabularNN with Focal Loss",
        min_training_samples=2000,
        training_time="30 minutes - 2 hours",
        prediction_latency_ms=15.0,
        interpretability="low",
        robustness="medium",
        expected_auc_range=(0.86, 0.93),
        deployment_complexity="high",
        strengths=[
            "Captures complex non-linear patterns",
            "Can use audio embeddings as input",
            "Multi-task learning (viral_prob + days_to_viral + peak_score)",
            "Focal loss handles 8% viral class imbalance",
            "Transfer learning from pre-trained audio models",
        ],
        weaknesses=[
            "Requires 2000+ labeled samples",
            "GPU training recommended",
            "Hard to interpret (LIME/SHAP approximations only)",
            "Overfits without careful regularization (dropout, weight decay)",
            "High deployment complexity",
        ],
        best_for=[
            "Large data (>2000 artists)",
            "Audio features available",
            "Accuracy is the primary constraint",
            "Self-teaching loop with continuous retraining",
        ],
        hyperparameters={
            "hidden_dims": [256, 128, 64],
            "dropout": 0.3,
            "focal_alpha": 0.25,
            "focal_gamma": 2.0,
            "lr": 1e-3,
            "weight_decay": 1e-4,
            "batch_size": 256,
        },
        feature_set="full_plus_temporal",
        module_path="ml.models.tabular_nn.TabularNN",
    ),
    "ensemble": ModelSpec(
        name="ensemble",
        tier="advanced",
        algorithm="Weighted Ensemble (XGBoost + TabularNN + LR)",
        min_training_samples=2000,
        training_time="2-4 hours",
        prediction_latency_ms=20.0,
        interpretability="low",
        robustness="high",
        expected_auc_range=(0.88, 0.95),
        deployment_complexity="high",
        strengths=[
            "Best overall AUC",
            "Reduces variance vs single model",
            "Graceful degradation if one model fails",
        ],
        weaknesses=[
            "Most complex to maintain",
            "Requires all sub-models to be trained",
            "Latency is sum of sub-models",
        ],
        best_for=[
            "Maximum accuracy when data is abundant",
            "Production at scale when interpretability is not required",
        ],
        hyperparameters={
            "xgb_weight": 0.5,
            "nn_weight": 0.35,
            "lr_weight": 0.15,
            "temperature": 1.0,
        },
        feature_set="full_plus_temporal",
        module_path="ml.models.ensemble.EnsemblePredictor",
    ),
}


RECOMMENDATION_MATRIX = [
    {"scenario": "Small data (<500 artists)",         "best_model": "logistic_regression", "why": "Less overfitting; 3 features work well with 200+ samples"},
    {"scenario": "Production (500-2000 artists)",     "best_model": "xgboost",             "why": "Best accuracy/interpretability tradeoff; SHAP values for A&R"},
    {"scenario": "Large data (>2000 artists)",        "best_model": "pytorch_tabular_nn",  "why": "Captures complex patterns; multi-task learning; audio embeddings"},
    {"scenario": "Need explainability",               "best_model": "logistic_regression", "why": "Coefficients show exact feature weights; no black-box needed"},
    {"scenario": "Need speed (<1ms prediction)",      "best_model": "logistic_regression", "why": "Matrix multiply — predicts in microseconds; stateless"},
    {"scenario": "Maximum accuracy",                  "best_model": "ensemble",            "why": "Weighted combination reduces variance vs any single model"},
    {"scenario": "Cold start (0 labeled data)",       "best_model": "rule_based",          "why": "Encodes domain expertise; no training required; always available"},
    {"scenario": "Robustness to distribution shift",  "best_model": "xgboost",             "why": "Gradient boosting is more robust than neural nets to covariate shift"},
    {"scenario": "Audio features available",          "best_model": "pytorch_tabular_nn",  "why": "Neural net can fuse tabular + audio embedding inputs natively"},
    {"scenario": "Self-teaching loop (weekly retrain)", "best_model": "xgboost",           "why": "Fast retraining (minutes); stable feature importance across runs"},
]


def _compute_auc(y_true: np.ndarray, y_score: np.ndarray) -> float:
    pos = y_score[y_true == 1]
    neg = y_score[y_true == 0]
    if len(pos) == 0 or len(neg) == 0:
        return 0.5
    wins = (pos[:, None] > neg[None, :]).sum()
    ties = (pos[:, None] == neg[None, :]).sum() * 0.5
    return float(wins + ties) / (len(pos) * len(neg))


def _precision_at_recall(y_true: np.ndarray, y_score: np.ndarray, target_recall: float = 0.5) -> float:
    """Compute precision at a given recall level."""
    try:
        order = np.argsort(-y_score)
        y_sorted = y_true[order]
        total_pos = y_true.sum()
        if total_pos == 0:
            return 0.0
        tp = 0
        for i, label in enumerate(y_sorted):
            tp += label
            recall = tp / total_pos
            if recall >= target_recall:
                precision = tp / (i + 1)
                return float(precision)
        return float(tp / len(y_true))
    except Exception:
        return 0.0


class ModelSelector:
    def __init__(self):
        self.registry = MODEL_REGISTRY
        self.matrix = RECOMMENDATION_MATRIX

    def select(self, n_artists: int, priority: PriorityScenario) -> SelectionResult:
        """Select the best model given data size and priority."""
        # Selection logic
        if n_artists < 200 or priority == PriorityScenario.COLD_START:
            rec_name = "rule_based"
            reasoning = (
                f"Cold start or insufficient data ({n_artists} artists < 200 minimum). "
                "Rule-based scorer requires no training data and encodes domain expertise directly."
            )
        elif priority == PriorityScenario.EXPLAINABILITY:
            rec_name = "logistic_regression"
            reasoning = (
                f"Explainability is the priority. Logistic regression coefficients directly show "
                "feature weights with no black-box components. Works with {n_artists} artists."
            )
        elif priority == PriorityScenario.SPEED:
            rec_name = "logistic_regression"
            reasoning = (
                "Speed is the priority. Logistic regression is a single matrix multiply — "
                "predicts in microseconds, stateless, no inference overhead."
            )
        elif n_artists < 500:
            rec_name = "logistic_regression"
            reasoning = (
                f"Small dataset ({n_artists} artists). Logistic regression avoids overfitting "
                "with only 3 core features and works well with 200+ samples."
            )
        elif n_artists < 2000:
            rec_name = "xgboost"
            reasoning = (
                f"Medium dataset ({n_artists} artists). XGBoost provides the best "
                "accuracy/interpretability tradeoff with SHAP values for A&R explainability."
            )
        elif priority == PriorityScenario.ACCURACY:
            rec_name = "ensemble"
            reasoning = (
                f"Large dataset ({n_artists} artists) with accuracy as priority. "
                "Weighted ensemble reduces variance vs any single model for maximum AUC."
            )
        else:
            rec_name = "pytorch_tabular_nn"
            reasoning = (
                f"Large dataset ({n_artists} artists). TabularNN captures complex non-linear "
                "patterns, supports audio embeddings, and enables multi-task learning."
            )

        recommended = self.registry[rec_name]

        # Fallback selection
        if rec_name in ("pytorch_tabular_nn", "ensemble"):
            fallback = self.registry["xgboost"]
        else:
            fallback = self.registry["rule_based"]

        data_requirement_met = n_artists >= recommended.min_training_samples

        comparison_table = self.compare_all()

        return SelectionResult(
            scenario_description=f"n_artists={n_artists}, priority={priority.value}",
            recommended_model=recommended,
            fallback_model=fallback,
            reasoning=reasoning,
            data_requirement_met=data_requirement_met,
            recommendation_matrix=list(self.matrix),
            comparison_table=comparison_table,
        )

    def compare_all(self) -> str:
        """Return a formatted markdown table comparing all 5 models."""
        headers = ["Model", "Tier", "Min Samples", "Train Time", "Latency (ms)", "Interpretability", "Robustness", "AUC Range", "Complexity"]
        rows = []
        for name, spec in self.registry.items():
            auc_str = f"{spec.expected_auc_range[0]:.2f}-{spec.expected_auc_range[1]:.2f}"
            rows.append([
                name,
                spec.tier,
                str(spec.min_training_samples),
                spec.training_time,
                str(spec.prediction_latency_ms),
                spec.interpretability,
                spec.robustness,
                auc_str,
                spec.deployment_complexity,
            ])

        col_widths = [max(len(h), max(len(r[i]) for r in rows)) for i, h in enumerate(headers)]
        sep = "| " + " | ".join("-" * w for w in col_widths) + " |"
        header_row = "| " + " | ".join(h.ljust(col_widths[i]) for i, h in enumerate(headers)) + " |"
        data_rows = ["| " + " | ".join(r[i].ljust(col_widths[i]) for i in range(len(headers))) + " |" for r in rows]

        lines = [
            "## ML Model Comparison — Breakout Artist Prediction",
            "",
            header_row,
            sep,
        ] + data_rows
        return "\n".join(lines)

    def run_benchmark(self, X: np.ndarray, y: np.ndarray) -> List[BenchmarkResult]:
        """Benchmark logistic_regression and rule_based on the provided dataset."""
        results = []
        n = len(y)
        split = int(n * 0.8)

        X_train, X_test = X[:split], X[split:]
        y_train, y_test = y[:split], y[split:]

        # Benchmark logistic regression
        try:
            from ml.models.baseline.logistic_model import LogisticBreakoutModel, _compute_auc as lr_auc
            model = LogisticBreakoutModel()
            model.fit(X_train, y_train)

            features_list = [
                {"save_rate": row[0], "stream_velocity": row[1], "ugc_growth_rate": row[2]}
                for row in X_test
            ]

            start = time.perf_counter()
            preds = [model.predict(f) for f in features_list]
            elapsed = time.perf_counter() - start
            avg_ms = (elapsed / len(features_list)) * 1000

            probs = np.array([p.breakout_probability for p in preds])
            auc = _compute_auc(y_test, probs)
            p_at_r = _precision_at_recall(y_test, probs, 0.5)

            results.append(BenchmarkResult(
                model_name="logistic_regression",
                n_samples=n,
                auc=round(auc, 4),
                precision_at_50pct_recall=round(p_at_r, 4),
                avg_prediction_ms=round(avg_ms, 4),
                notes=f"Trained on {split} samples, tested on {n - split} samples.",
            ))
        except Exception as e:
            results.append(BenchmarkResult(
                model_name="logistic_regression",
                n_samples=n,
                auc=0.0,
                precision_at_50pct_recall=0.0,
                avg_prediction_ms=0.0,
                notes=f"Benchmark failed: {e}",
            ))

        # Benchmark rule_based (uses only 3 core features)
        try:
            from ml.models.rules.rule_based_scorer import RuleBasedScorer
            scorer = RuleBasedScorer()
            features_list = [
                {"save_rate": row[0], "stream_velocity": row[1], "ugc_growth_rate": row[2]}
                for row in X_test
            ]

            start = time.perf_counter()
            scores = [scorer.score(f) for f in features_list]
            elapsed = time.perf_counter() - start
            avg_ms = (elapsed / len(features_list)) * 1000

            # Convert scores to probabilities (score / 100)
            probs = np.array([s.score / 100.0 for s in scores])
            auc = _compute_auc(y_test, probs)
            p_at_r = _precision_at_recall(y_test, probs, 0.5)

            results.append(BenchmarkResult(
                model_name="rule_based",
                n_samples=n,
                auc=round(auc, 4),
                precision_at_50pct_recall=round(p_at_r, 4),
                avg_prediction_ms=round(avg_ms, 4),
                notes=f"No training required. Tested on {n - split} samples using 3 core features.",
            ))
        except Exception as e:
            results.append(BenchmarkResult(
                model_name="rule_based",
                n_samples=n,
                auc=0.0,
                precision_at_50pct_recall=0.0,
                avg_prediction_ms=0.0,
                notes=f"Benchmark failed: {e}",
            ))

        return results

    def print_recommendation(self, result: SelectionResult) -> str:
        """Return multi-line string with formatted recommendation."""
        rec = result.recommended_model
        fb = result.fallback_model

        # Star rating based on AUC
        auc_mid = (rec.expected_auc_range[0] + rec.expected_auc_range[1]) / 2
        stars = "★★★★★" if auc_mid > 0.90 else "★★★★☆" if auc_mid > 0.85 else "★★★☆☆" if auc_mid > 0.78 else "★★☆☆☆"

        req_status = "MET" if result.data_requirement_met else f"NOT MET (need {rec.min_training_samples}+ samples)"

        matrix_rows = []
        for row in result.recommendation_matrix:
            matrix_rows.append(f"  | {row['scenario']:<40} | {row['best_model']:<22} | {row['why']}")

        lines = [
            "=" * 70,
            "  BREAKOUT ARTIST PREDICTION — MODEL RECOMMENDATION",
            "=" * 70,
            f"  Scenario: {result.scenario_description}",
            "",
            f"  RECOMMENDED: {rec.name.upper()}  {stars}",
            f"  Algorithm:   {rec.algorithm}",
            f"  AUC Range:   {rec.expected_auc_range[0]:.2f} - {rec.expected_auc_range[1]:.2f}",
            f"  Latency:     {rec.prediction_latency_ms}ms",
            f"  Data req:    {req_status}",
            "",
            f"  FALLBACK:    {fb.name.upper()}",
            f"  (Use if recommended model fails or data is insufficient)",
            "",
            "  REASONING:",
            f"  {result.reasoning}",
            "",
            "  RECOMMENDATION MATRIX:",
            "  " + "-" * 95,
            "  | Scenario                                 | Best Model             | Why",
            "  " + "-" * 95,
        ] + matrix_rows + [
            "  " + "-" * 95,
            "",
            result.comparison_table,
            "=" * 70,
        ]
        return "\n".join(lines)
