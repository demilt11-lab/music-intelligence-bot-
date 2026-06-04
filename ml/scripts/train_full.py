"""
Full training pipeline: train all models, run CV, tune hyperparameters,
compare results, select champion, export for production.

Usage:
    python -m ml.scripts.train_full --config ml/conf/config.yaml
    python -m ml.scripts.train_full --model xgboost --no-cv --no-tuning
    python -m ml.scripts.train_full --models all --n-trials 100 --epochs 200
"""

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import torch


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train all viral prediction models.")
    p.add_argument("--models", default="all",
                   choices=["all", "transformer", "lstm", "tabular", "xgboost", "ensemble"],
                   help="Which model(s) to train")
    p.add_argument("--n-samples", type=int, default=10_000,
                   help="Synthetic dataset size (10K for quick, 100K for full)")
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--n-trials", type=int, default=50, help="Optuna trials per model")
    p.add_argument("--no-cv", action="store_true", help="Skip cross-validation")
    p.add_argument("--no-tuning", action="store_true", help="Skip hyperparameter tuning")
    p.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    p.add_argument("--output-dir", default="ml/outputs/")
    p.add_argument("--experiment", default="viral_prediction", help="MLflow experiment name")
    p.add_argument("--config", default=None, help="Optional Hydra config YAML path")
    return p.parse_args()


def _resolve_models(models_arg: str) -> List[str]:
    if models_arg == "all":
        return ["xgboost", "lstm", "tabular"]
    return [models_arg]


def _generate_or_load_data(n_samples: int, output_dir: str):
    """Generate synthetic dataset or load from disk if cached."""
    from ml.data.tiktok_dataset import ViralDataSynthesizer, build_tiktok_dataloaders

    cache_path = Path(output_dir) / "synthetic_records.pkl"
    if cache_path.exists():
        import cloudpickle
        print(f"Loading cached dataset from {cache_path}")
        with open(cache_path, "rb") as f:
            records = cloudpickle.load(f)
    else:
        print(f"Generating {n_samples:,} synthetic records...")
        synth = ViralDataSynthesizer(seed=42)
        records = synth.generate(n=n_samples, viral_rate=0.08)
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        import cloudpickle
        with open(cache_path, "wb") as f:
            cloudpickle.dump(records, f)
        print(f"  viral: {sum(r.is_viral for r in records)} / {len(records)}")

    train_loader, val_loader, test_loader = build_tiktok_dataloaders(
        records, batch_size=256, num_workers=0
    )
    return records, train_loader, val_loader, test_loader


def _extract_numpy(records: List[Any]):
    """Extract flat numpy feature matrices for tree-based and CV models."""
    from ml.training.cross_validation import CrossValidator
    X = CrossValidator._extract_features(records)
    y = np.array([float(r.is_viral) for r in records])
    y_days = np.array([r.days_to_viral or 0.0 for r in records])
    y_peak = np.array([r.peak_viral_score for r in records])
    return X, y, y_days, y_peak


def _train_xgboost(X_train, y_tr, y_days, y_peak, X_val, y_val,
                   best_params: Optional[Dict] = None):
    from ml.models.xgboost_model import ViralXGBoost, XGBoostConfig
    cfg_kwargs = best_params or {}
    cfg = XGBoostConfig(**{k: v for k, v in cfg_kwargs.items()
                           if k in XGBoostConfig.__dataclass_fields__})
    model = ViralXGBoost(cfg)
    model.fit(X_train, y_tr, y_days, y_peak,
              eval_set=(X_val, y_val))
    return model


def _train_lstm(records_train, records_val, device: str,
                best_params: Optional[Dict] = None, epochs: int = 20):
    from torch.utils.data import DataLoader
    from ml.data.tiktok_dataset import TikTokViralDataset
    from ml.models.lstm_model import LSTMConfig, LSTMViralModel
    from ml.training.focal_loss import MultiTaskFocalLoss

    cfg_kwargs = best_params or {}
    cfg = LSTMConfig(**{k: v for k, v in cfg_kwargs.items()
                        if k in LSTMConfig.__dataclass_fields__})
    model = LSTMViralModel(cfg).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    loss_fn = MultiTaskFocalLoss()

    train_ds = TikTokViralDataset(records_train, augment=True)
    val_ds = TikTokViralDataset(records_val, augment=False)
    train_loader = DataLoader(train_ds, batch_size=128, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=128, shuffle=False, num_workers=0)

    for epoch in range(epochs):
        model.train()
        for batch in train_loader:
            ts = batch["timeseries"].to(device)
            lengths = batch["lengths"]
            out = model(ts, lengths)
            targets = {
                "viral": batch["label_viral"].to(device),
                "days": batch["label_days"].to(device),
                "peak": batch["label_peak"].to(device),
            }
            preds = {
                "viral_logit": torch.logit(out.viral_prob.squeeze()),
                "days": out.days_to_viral.squeeze(),
                "peak": out.peak_score.squeeze(),
            }
            loss_dict = loss_fn(preds, targets)
            optimizer.zero_grad()
            loss_dict["total"].backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

    return model


def _train_tabular(records_train, records_val, device: str,
                   best_params: Optional[Dict] = None, epochs: int = 20):
    from torch.utils.data import DataLoader
    from ml.data.tiktok_dataset import TikTokViralDataset
    from ml.models.tabular_nn import TabularConfig, TabularNN
    from ml.training.focal_loss import MultiTaskFocalLoss

    cfg_kwargs = best_params or {}
    cfg = TabularConfig(**{k: v for k, v in cfg_kwargs.items()
                           if k in TabularConfig.__dataclass_fields__})
    model = TabularNN(cfg).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    loss_fn = MultiTaskFocalLoss()

    def _tabular_feats(rec) -> torch.Tensor:
        audio = np.array(rec.audio_features[:64], dtype=np.float32)
        if len(audio) < 64:
            audio = np.pad(audio, (0, 64 - len(audio)))
        return torch.tensor(audio, dtype=torch.float32)

    train_ds = TikTokViralDataset(records_train, augment=True)
    val_ds = TikTokViralDataset(records_val, augment=False)
    train_loader = DataLoader(train_ds, batch_size=128, shuffle=True, num_workers=0)

    for epoch in range(epochs):
        model.train()
        for batch in train_loader:
            x = batch["audio"].to(device)  # (B, 64)
            out = model(x)
            targets = {
                "viral": batch["label_viral"].to(device),
                "days": batch["label_days"].to(device),
                "peak": batch["label_peak"].to(device),
            }
            preds = {
                "viral_logit": torch.logit(out.viral_prob.squeeze()),
                "days": out.days_to_viral.squeeze(),
                "peak": out.peak_score.squeeze(),
            }
            loss_dict = loss_fn(preds, targets)
            optimizer.zero_grad()
            loss_dict["total"].backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

    return model


def _evaluate_model(model_name: str, model: Any, X_test: np.ndarray, y_test: np.ndarray,
                    records_test: List[Any], device: str) -> "ModelResult":
    from ml.evaluation.model_comparison import ModelResult
    from sklearn.metrics import (roc_auc_score, average_precision_score,
                                 f1_score, precision_score, recall_score,
                                 matthews_corrcoef)

    t0 = time.time()
    if model_name == "xgboost":
        probs = model.predict(X_test).viral_prob
    elif model_name in ("lstm", "tabular"):
        from torch.utils.data import DataLoader
        from ml.data.tiktok_dataset import TikTokViralDataset
        ds = TikTokViralDataset(records_test, augment=False)
        loader = DataLoader(ds, batch_size=256, shuffle=False, num_workers=0)
        all_probs = []
        model.eval()
        with torch.no_grad():
            for batch in loader:
                if model_name == "lstm":
                    out = model(batch["timeseries"].to(device), batch["lengths"])
                else:
                    out = model(batch["audio"].to(device))
                all_probs.append(out.viral_prob.squeeze().cpu().numpy())
        probs = np.concatenate(all_probs)
    else:
        probs = np.random.rand(len(y_test))

    elapsed = (time.time() - t0) * 1000

    preds = (probs >= 0.5).astype(int)
    metrics = {
        "auroc": float(roc_auc_score(y_test, probs)) if len(np.unique(y_test)) > 1 else float("nan"),
        "auprc": float(average_precision_score(y_test, probs)) if len(np.unique(y_test)) > 1 else float("nan"),
        "f1": float(f1_score(y_test, preds, zero_division=0)),
        "precision": float(precision_score(y_test, preds, zero_division=0)),
        "recall": float(recall_score(y_test, preds, zero_division=0)),
        "accuracy": float((preds == y_test).mean()),
        "mcc": float(matthews_corrcoef(y_test, preds)),
    }
    return ModelResult(
        model_name=model_name,
        metrics=metrics,
        predictions=preds,
        probabilities=probs,
        inference_time_ms=elapsed,
    )


def main() -> None:
    args = parse_args()
    Path(args.output_dir).mkdir(parents=True, exist_ok=True)
    models_to_train = _resolve_models(args.models)

    # MLflow setup
    try:
        import mlflow
        mlflow.set_experiment(args.experiment)
        mlflow.start_run()
    except Exception:
        mlflow = None  # type: ignore

    print(f"Device: {args.device}")
    print(f"Models: {models_to_train}")

    # 1. Data
    records, train_loader, val_loader, test_loader = _generate_or_load_data(
        args.n_samples, args.output_dir
    )

    from sklearn.model_selection import train_test_split
    labels = np.array([int(r.is_viral) for r in records])
    idx = np.arange(len(records))
    idx_tr, idx_tmp = train_test_split(idx, test_size=0.2, stratify=labels, random_state=42)
    idx_val, idx_test = train_test_split(idx_tmp, test_size=0.5, stratify=labels[idx_tmp], random_state=42)
    records_train = [records[i] for i in idx_tr]
    records_val = [records[i] for i in idx_val]
    records_test = [records[i] for i in idx_test]

    X, y, y_days, y_peak = _extract_numpy(records)
    X_tr, y_tr = X[idx_tr], y[idx_tr]
    X_val, y_val = X[idx_val], y[idx_val]
    X_test, y_test = X[idx_test], y[idx_test]

    # 2. Optuna tuning
    best_params: Dict[str, Optional[Dict]] = {m: None for m in models_to_train}
    if not args.no_tuning:
        from ml.training.hyperparameter_tuning import HyperparameterTuner
        from ml.data.tiktok_dataset import TikTokViralDataset

        class _DS:
            def __init__(self, recs):
                self.records = recs

        for model_name in models_to_train:
            print(f"\nTuning {model_name} ({args.n_trials} trials)...")
            tuner = HyperparameterTuner(model_name, n_trials=args.n_trials)
            result = tuner.tune(
                _DS(records_train), _DS(records_val), timeout_seconds=3600
            )
            best_params[model_name] = result.best_params
            out_path = Path(args.output_dir) / f"best_params_{model_name}.json"
            with open(out_path, "w") as f:
                json.dump(result.best_params, f, indent=2, default=str)
            print(f"  best {tuner.metric}: {result.best_value:.4f}")

    # 3. Train models
    trained: Dict[str, Any] = {}
    for model_name in models_to_train:
        print(f"\nTraining {model_name}...")
        params = best_params.get(model_name)
        if model_name == "xgboost":
            trained[model_name] = _train_xgboost(
                X_tr, y_tr, y_days[idx_tr], y_peak[idx_tr], X_val, y_val, params
            )
        elif model_name == "lstm":
            trained[model_name] = _train_lstm(
                records_train, records_val, args.device, params, epochs=min(args.epochs, 20)
            )
        elif model_name == "tabular":
            trained[model_name] = _train_tabular(
                records_train, records_val, args.device, params, epochs=min(args.epochs, 20)
            )

    # 4. Cross-validation
    if not args.no_cv:
        from ml.training.cross_validation import CrossValidator, CVConfig
        from ml.data.tiktok_dataset import TikTokViralDataset
        print("\nRunning 5-fold cross-validation...")
        cv_cfg = CVConfig(n_folds=5, models=models_to_train)
        cv_validator = CrossValidator(cv_cfg)
        full_ds = TikTokViralDataset(records)
        cv_results = cv_validator.run(full_ds, model_configs={})
        print("\nCV Results:")
        print(cv_results.summary().to_string(index=False))
        print(f"Best CV model: {cv_results.best_model}")

        # CV visualization
        from ml.visualization.training_curves import TrainingVisualizer
        viz = TrainingVisualizer()
        viz.plot_cv_boxplot(
            cv_results, "auroc",
            str(Path(args.output_dir) / "cv_boxplot.png")
        )

    # 5. Evaluate on test set
    from ml.evaluation.model_comparison import ModelComparison
    comparison = ModelComparison()
    print("\nEvaluating on test set...")
    for model_name, model in trained.items():
        result = _evaluate_model(model_name, model, X_test, y_test, records_test, args.device)
        comparison.add_result(result)
        print(f"  {model_name}: AUROC={result.metrics.get('auroc', 0):.4f}")

    # 6. Feature importance
    if "xgboost" in trained:
        from ml.evaluation.feature_importance import FeatureImportanceAnalyzer
        analyzer = FeatureImportanceAnalyzer()
        fi_result = analyzer.xgboost_importance(trained["xgboost"])
        analyzer.plot_importance(
            fi_result,
            str(Path(args.output_dir) / "feature_importance.png"),
            top_n=20,
        )

    # 7. Plots
    comparison.plot_comparison(str(Path(args.output_dir) / "model_comparison.png"))
    comparison.plot_roc_curves(str(Path(args.output_dir) / "roc_curves.png"))
    comparison.plot_pr_curves(str(Path(args.output_dir) / "pr_curves.png"))
    comparison.generate_latex_table(str(Path(args.output_dir) / "results_table.tex"))

    # 8. Print leaderboard
    print("\n" + comparison.summary())

    # 9. Champion model
    df = comparison.rank_models()
    if not df.empty:
        champion = df.iloc[0]["model"]
        print(f"\nChampion: {champion}")
        if champion in trained:
            champ_path = str(Path(args.output_dir) / f"champion_{champion}.pkl")
            if hasattr(trained[champion], "save"):
                trained[champion].save(champ_path)
                print(f"Saved champion to {champ_path}")

    # 10. MLflow logging
    if mlflow is not None:
        try:
            for name, res in comparison.results.items():
                for k, v in res.metrics.items():
                    mlflow.log_metric(f"{name}_{k}", v)
            mlflow.end_run()
        except Exception:
            pass

    print("\nDone.")


if __name__ == "__main__":
    main()
