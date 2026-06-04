"""
Standalone hyperparameter tuning. Saves best params to JSON.

Usage:
    python -m ml.scripts.tune --model xgboost --n-trials 100 --timeout 3600
    python -m ml.scripts.tune --model transformer --n-trials 50 --timeout 7200
"""

import argparse
import json
from pathlib import Path

import numpy as np


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Hyperparameter tuning via Optuna.")
    p.add_argument("--model", required=True,
                   choices=["transformer", "lstm", "tabular", "xgboost"],
                   help="Model type to tune")
    p.add_argument("--n-trials", type=int, default=50)
    p.add_argument("--timeout", type=int, default=3600, help="Timeout in seconds")
    p.add_argument("--n-samples", type=int, default=5000,
                   help="Synthetic data size for tuning")
    p.add_argument("--output-dir", default="ml/outputs/")
    p.add_argument("--visualize", action="store_true",
                   help="Generate Optuna optimization history plot")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    Path(args.output_dir).mkdir(parents=True, exist_ok=True)

    # Generate small synthetic dataset for tuning
    from ml.data.tiktok_dataset import ViralDataSynthesizer, TikTokViralDataset

    print(f"Generating {args.n_samples} synthetic samples for tuning...")
    synth = ViralDataSynthesizer(seed=42)
    records = synth.generate(n=args.n_samples, viral_rate=0.08)

    split = int(len(records) * 0.8)
    train_recs = records[:split]
    val_recs = records[split:]

    class _DS:
        def __init__(self, recs):
            self.records = recs

    from ml.training.hyperparameter_tuning import HyperparameterTuner

    print(f"\nTuning {args.model} with {args.n_trials} trials (timeout={args.timeout}s)...")
    tuner = HyperparameterTuner(
        model_type=args.model,
        n_trials=args.n_trials,
        direction="maximize",
        metric="val_auroc",
    )
    result = tuner.tune(
        _DS(train_recs),
        _DS(val_recs),
        timeout_seconds=args.timeout,
    )

    print(f"\nCompleted {result.n_trials} trials in {result.duration_seconds:.1f}s")
    print(f"Best {tuner.metric}: {result.best_value:.4f}")
    print(f"Best params: {json.dumps(result.best_params, indent=2, default=str)}")

    if result.top_trials:
        print("\nTop 5 trials:")
        for i, t in enumerate(result.top_trials[:5], 1):
            print(f"  {i}. value={t['value']:.4f} | {t['params']}")

    # Save best params
    out_path = Path(args.output_dir) / f"best_params_{args.model}.json"
    with open(out_path, "w") as f:
        json.dump(result.best_params, f, indent=2, default=str)
    print(f"\nBest params saved to {out_path}")

    # Optional visualization
    if args.visualize:
        try:
            import optuna
            from ml.visualization.training_curves import TrainingVisualizer
            storage = f"sqlite:///ml/outputs/optuna_{args.model}.db"
            study = optuna.load_study(study_name=result.study_name, storage=storage)
            viz = TrainingVisualizer()
            plot_path = str(Path(args.output_dir) / f"optuna_history_{args.model}.png")
            viz.plot_optuna_history(study, plot_path)
            print(f"Optimization history plot saved to {plot_path}")
        except Exception as e:
            print(f"Visualization failed: {e}")


if __name__ == "__main__":
    main()
