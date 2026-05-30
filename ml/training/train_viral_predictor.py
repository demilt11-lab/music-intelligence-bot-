# ml/training/train_viral_predictor.py
"""
Viral prediction model.
Uses a stacked ensemble:
  - XGBoost (gradient boosting on tabular features)
  - LightGBM (fast boosting variant)
  - MLP neural net (captures non-linear interactions)
  - Logistic regression meta-learner (stacks outputs)

Predicts:
  - viral_label: will this track go viral in 30 days (binary)
  - viral_probability: confidence score 0-1
  - pre_viral_flag: is it showing early pre-viral signals
"""

import os
import json
import logging
import numpy as np
import joblib
from typing import Dict, List, Tuple

from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    classification_report,
    roc_auc_score,
    average_precision_score,
)
from sklearn.neural_network import MLPClassifier

import xgboost as xgb
import lightgbm as lgb

from feature_engineering import build_feature_matrix, extract_labels

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_DIR = "output/models"


def load_labeled_data(path: str) -> List[Dict]:
    with open(path) as f:
        rows = json.load(f)
    labeled = [r for r in rows if r.get("viral_label") is not None]
    logger.info(f"Loaded {len(labeled)} labeled rows from {path}")
    return labeled


def train_xgb(X_train, y_train) -> xgb.XGBClassifier:
    model = xgb.XGBClassifier(
        n_estimators=500,
        learning_rate=0.03,
        max_depth=5,
        min_child_weight=3,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=sum(y_train == 0) / (sum(y_train == 1) + 1),
        use_label_encoder=False,
        eval_metric="aucpr",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)
    return model


def train_lgbm(X_train, y_train) -> lgb.LGBMClassifier:
    model = lgb.LGBMClassifier(
        n_estimators=500,
        learning_rate=0.03,
        num_leaves=63,
        min_child_samples=10,
        subsample=0.8,
        colsample_bytree=0.8,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )
    model.fit(X_train, y_train)
    return model


def train_mlp(X_train, y_train) -> MLPClassifier:
    model = MLPClassifier(
        hidden_layer_sizes=(256, 128, 64),
        activation="relu",
        solver="adam",
        alpha=0.001,
        batch_size=64,
        learning_rate="adaptive",
        max_iter=300,
        random_state=42,
    )
    model.fit(X_train, y_train)
    return model


def build_stacked_model(
    X: np.ndarray,
    y: np.ndarray,
) -> Dict:
    """
    Trains base models via cross-validation to generate
    out-of-fold predictions, then trains a meta-learner on top.
    """
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    n = len(X)

    oof_xgb = np.zeros(n)
    oof_lgbm = np.zeros(n)
    oof_mlp = np.zeros(n)

    xgb_models, lgbm_models, mlp_models = [], [], []

    for fold, (tr_idx, val_idx) in enumerate(skf.split(X, y)):
        logger.info(f"Training fold {fold + 1}/5...")
        X_tr, X_val = X[tr_idx], X[val_idx]
        y_tr, y_val = y[tr_idx], y[val_idx]

        xgb_m = train_xgb(X_tr, y_tr)
        lgbm_m = train_lgbm(X_tr, y_tr)
        mlp_m = train_mlp(X_tr, y_tr)

        oof_xgb[val_idx] = xgb_m.predict_proba(X_val)[:, 1]
        oof_lgbm[val_idx] = lgbm_m.predict_proba(X_val)[:, 1]
        oof_mlp[val_idx] = mlp_m.predict_proba(X_val)[:, 1]

        xgb_models.append(xgb_m)
        lgbm_models.append(lgbm_m)
        mlp_models.append(mlp_m)

    # Stack OOF predictions as meta-features
    meta_X = np.column_stack([oof_xgb, oof_lgbm, oof_mlp])
    meta_learner = LogisticRegression(C=1.0, max_iter=500)
    meta_learner.fit(meta_X, y)

    auc = roc_auc_score(y, meta_learner.predict_proba(meta_X)[:, 1])
    ap = average_precision_score(y, meta_learner.predict_proba(meta_X)[:, 1])
    logger.info(f"Stacked model AUC-ROC: {auc:.4f} | Avg Precision: {ap:.4f}")

    return {
        "xgb_models": xgb_models,
        "lgbm_models": lgbm_models,
        "mlp_models": mlp_models,
        "meta_learner": meta_learner,
        "metrics": {"auc_roc": auc, "avg_precision": ap},
    }


def predict_stacked(stack: Dict, X: np.ndarray) -> np.ndarray:
    """Returns viral probability scores for each sample."""
    xgb_preds = np.mean([m.predict_proba(X)[:, 1] for m in stack["xgb_models"]], axis=0)
    lgbm_preds = np.mean([m.predict_proba(X)[:, 1] for m in stack["lgbm_models"]], axis=0)
    mlp_preds = np.mean([m.predict_proba(X)[:, 1] for m in stack["mlp_models"]], axis=0)

    meta_X = np.column_stack([xgb_preds, lgbm_preds, mlp_preds])
    return stack["meta_learner"].predict_proba(meta_X)[:, 1]


def main():
    input_file = "output/data/features_labeled.json"
    rows = load_labeled_data(input_file)

    if len(rows) < 50:
        logger.warning(f"Only {len(rows)} labeled rows; need more for reliable training.")

    X, feature_names = build_feature_matrix(rows, fit_scaler=True)
    y = extract_labels(rows, label_key="viral_label")

    logger.info(f"Class distribution: viral={y.sum()} non-viral={len(y) - y.sum()}")

    stack = build_stacked_model(X, y)

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(stack, f"{MODEL_DIR}/viral_predictor_stack.pkl")
    joblib.dump(feature_names, f"{MODEL_DIR}/feature_names.pkl")

    meta = {
        "feature_count": len(feature_names),
        "training_samples": len(rows),
        "metrics": stack["metrics"],
        "feature_names": feature_names[:20],
    }
    with open(f"{MODEL_DIR}/viral_predictor_metadata.json", "w") as f:
        json.dump(meta, f, indent=2)

    logger.info("Viral predictor saved.")


if __name__ == "__main__":
    main()
