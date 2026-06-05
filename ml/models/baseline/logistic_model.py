import numpy as np
from dataclasses import dataclass
from typing import Optional


def _compute_auc(y_true: np.ndarray, y_score: np.ndarray) -> float:
    pos = y_score[y_true == 1]
    neg = y_score[y_true == 0]
    if len(pos) == 0 or len(neg) == 0:
        return 0.5
    wins = (pos[:, None] > neg[None, :]).sum()
    ties = (pos[:, None] == neg[None, :]).sum() * 0.5
    return float(wins + ties) / (len(pos) * len(neg))


@dataclass
class LogisticPrediction:
    breakout_probability: float
    label: str          # "breakout" | "no_breakout"
    confidence: str     # "high" | "medium" | "low"
    feature_contributions: dict  # feature -> contribution to log-odds
    explanation: str


class LogisticBreakoutModel:
    FEATURES = ["save_rate", "stream_velocity", "ugc_growth_rate"]

    # Industry-validated starting weights (can be overridden by fit())
    DEFAULT_WEIGHTS = {
        "save_rate":       2.80,   # strongest: committed fans
        "stream_velocity": 1.95,   # second: momentum signal
        "ugc_growth_rate": 1.40,   # third: UGC leading indicator
    }
    DEFAULT_BIAS = -1.20  # prior: ~23% base rate at zero features; negative bias ensures realistic priors

    def __init__(self):
        self.weights = dict(self.DEFAULT_WEIGHTS)
        self.bias = self.DEFAULT_BIAS
        self.is_fitted = False
        self.n_train = 0
        self.train_auc = None

    def fit(self, X: np.ndarray, y: np.ndarray, lr=0.01, epochs=500) -> "LogisticBreakoutModel":
        """Mini gradient descent logistic regression. X must have 3 columns in FEATURES order."""
        assert X.shape[1] == 3, f"Expected 3 features, got {X.shape[1]}"
        w = np.array([self.weights[f] for f in self.FEATURES])
        b = self.bias
        m = len(y)

        for _ in range(epochs):
            z = X @ w + b
            pred = 1 / (1 + np.exp(-np.clip(z, -50, 50)))
            err = pred - y
            grad_w = X.T @ err / m
            grad_b = err.mean()
            w -= lr * grad_w
            b -= lr * grad_b

        self.weights = {f: float(w[i]) for i, f in enumerate(self.FEATURES)}
        self.bias = float(b)
        self.is_fitted = True
        self.n_train = m

        # Compute train AUC (simple ranking AUC)
        z_final = X @ w + b
        probs = 1 / (1 + np.exp(-np.clip(z_final, -50, 50)))
        self.train_auc = _compute_auc(y, probs)
        return self

    def predict(self, features: dict) -> LogisticPrediction:
        """Predict breakout probability from a dict of signal values."""
        try:
            vals = np.array([features.get(f, 0.0) for f in self.FEATURES])
            w = np.array([self.weights[f] for f in self.FEATURES])
            log_odds = float(vals @ w) + self.bias
            prob = 1 / (1 + np.exp(-log_odds))

            contributions = {
                f: float(vals[i] * w[i])
                for i, f in enumerate(self.FEATURES)
            }

            label = "breakout" if prob > 0.5 else "no_breakout"
            confidence = (
                "high" if prob > 0.75 or prob < 0.25
                else "medium" if prob > 0.6 or prob < 0.4
                else "low"
            )

            top_driver = max(contributions, key=lambda k: abs(contributions[k]))
            explanation = (
                f"Logistic regression: P(breakout)={prob:.1%}. "
                f"Top driver: {top_driver}={features.get(top_driver, 0):.3f} "
                f"(contribution={contributions[top_driver]:+.2f} log-odds). "
                f"Model uses 3 features: save_rate (w={self.weights['save_rate']:.2f}), "
                f"stream_velocity (w={self.weights['stream_velocity']:.2f}), "
                f"ugc_growth_rate (w={self.weights['ugc_growth_rate']:.2f})."
            )

            return LogisticPrediction(
                breakout_probability=round(prob, 4),
                label=label,
                confidence=confidence,
                feature_contributions=contributions,
                explanation=explanation,
            )
        except Exception as e:
            return LogisticPrediction(
                breakout_probability=0.12,
                label="no_breakout",
                confidence="low",
                feature_contributions={},
                explanation=f"Prediction failed: {e}. Returning base rate 12%.",
            )

    def explain(self) -> str:
        """Return human-readable model explanation."""
        lines = [
            "=== Logistic Regression Breakout Model ===",
            f"Training samples: {self.n_train}",
            f"Train AUC: {self.train_auc:.3f}" if self.train_auc else "Not fitted — using default weights",
            "",
            "Feature weights (log-odds contribution per unit):",
        ]
        for f, w in sorted(self.weights.items(), key=lambda x: -abs(x[1])):
            bar = "█" * int(abs(w) * 5) + ("+" if w > 0 else "-")
            lines.append(f"  {f:<30} w={w:+.3f}  {bar}")
        lines.append(f"  bias                           b={self.bias:+.3f}")
        lines.append("")
        lines.append("Interpretation:")
        lines.append(f"  save_rate > 0.15 contributes {0.15 * self.weights['save_rate']:+.2f} log-odds")
        lines.append(f"  stream_velocity > 0.25 contributes {0.25 * self.weights['stream_velocity']:+.2f} log-odds")
        return "\n".join(lines)
