"""
CLI training script for ViralTransformer.

Usage:
    python -m ml.scripts.train \
        --data-dir /path/to/data \
        --checkpoint-dir /path/to/checkpoints \
        --epochs 100 \
        --batch-size 256 \
        --lr 3e-4 \
        --device cuda

The data directory should contain train.jsonl and val.jsonl files,
each with one JSON record per line in the MusicViralDataset format.
"""

import argparse
import json
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train ViralTransformer for music virality prediction"
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        required=True,
        help="Directory containing train.jsonl and val.jsonl",
    )
    parser.add_argument(
        "--checkpoint-dir",
        type=str,
        required=True,
        help="Directory to save model checkpoints and outputs",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=100,
        help="Number of training epochs (default: 100)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=256,
        help="Training batch size (default: 256)",
    )
    parser.add_argument(
        "--lr",
        type=float,
        default=3e-4,
        help="Learning rate (default: 3e-4)",
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cuda",
        help="Device to train on: cuda or cpu (default: cuda)",
    )
    parser.add_argument(
        "--resume",
        type=str,
        default=None,
        help="Path to a checkpoint file to resume training from",
    )
    parser.add_argument(
        "--benchmark",
        action="store_true",
        help="Run benchmarks and print comparison table after training",
    )
    return parser.parse_args()


def load_jsonl(path: Path):
    records = []
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def main() -> None:
    args = parse_args()

    data_dir = Path(args.data_dir)
    checkpoint_dir = Path(args.checkpoint_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    # Import here to avoid slow import at argparse stage
    import torch
    from ml.models import ViralTransformer
    from ml.data import build_dataloaders
    from ml.training import Trainer, TrainerConfig
    from ml.visualization import plot_training_curves
    from ml.evaluation import run_benchmarks

    # Resolve device
    device = args.device
    if device == "cuda" and not torch.cuda.is_available():
        print("WARNING: CUDA not available, falling back to CPU", file=sys.stderr)
        device = "cpu"

    print(f"Training on device: {device}")

    # Load data records
    train_path = data_dir / "train.jsonl"
    val_path = data_dir / "val.jsonl"
    print(f"Loading training data from {train_path} ...")
    train_records = load_jsonl(train_path)
    print(f"Loading validation data from {val_path} ...")
    val_records = load_jsonl(val_path)
    print(f"  train={len(train_records):,}  val={len(val_records):,}")

    # Build model with default config
    model = ViralTransformer()
    print(
        f"ViralTransformer parameters: "
        f"{sum(p.numel() for p in model.parameters() if p.requires_grad):,}"
    )

    # Build dataloaders
    train_loader, val_loader, _ = build_dataloaders(
        train_records=train_records,
        val_records=val_records,
        batch_size=args.batch_size,
    )

    # Build trainer config
    config = TrainerConfig(
        num_epochs=args.epochs,
        learning_rate=args.lr,
        device=device,
        checkpoint_dir=str(checkpoint_dir),
    )

    # Optionally load checkpoint
    if args.resume:
        print(f"Resuming from checkpoint: {args.resume}")
        state = torch.load(args.resume, map_location=device)
        model.load_state_dict(state["model_state_dict"])

    # Train
    trainer = Trainer(model=model, train_loader=train_loader, val_loader=val_loader, config=config)
    history = trainer.train()

    # Save training curves
    curves_path = checkpoint_dir / "training_curves.png"
    fig = plot_training_curves(history, title="ViralTransformer Training")
    fig.savefig(str(curves_path), dpi=150, bbox_inches="tight")
    print(f"Training curves saved to {curves_path}")

    # Optionally run benchmarks
    if args.benchmark:
        print("\nRunning benchmarks...")
        results = run_benchmarks(test_loader=val_loader, viral_transformer=model, device=torch.device(device))
        for name, result in results.items():
            print(f"\n{name}:")
            for k, v in vars(result).items():
                print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
