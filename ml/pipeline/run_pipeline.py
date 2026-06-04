"""
Full ML pipeline orchestrator. Runs all stages: data_prep → train → evaluate → registry → export.
"""
import argparse
import subprocess
import sys
from pathlib import Path


STAGE_MODULES = {
    "data_prep": "ml.pipeline.data_prep",
    "train": "ml.pipeline.train",
    "evaluate": "ml.pipeline.evaluate",
    "export": "ml.pipeline.export",
}

STAGE_ORDER = ["data_prep", "train", "evaluate", "export"]


def run_stage(stage: str, overrides: list[str] | None = None) -> int:
    """Run a pipeline stage via its Hydra entrypoint as a subprocess.

    Returns the subprocess return code.
    """
    module = STAGE_MODULES[stage]
    cmd = [sys.executable, "-m", module] + (overrides or [])
    print(f"\n{'='*60}")
    print(f"  Stage: {stage}")
    print(f"  Command: {' '.join(cmd)}")
    print(f"{'='*60}")
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        print(f"[ERROR] Stage '{stage}' exited with code {result.returncode}", file=sys.stderr)
    return result.returncode


def main() -> None:
    parser = argparse.ArgumentParser(description="Run ML training pipeline")
    parser.add_argument(
        "--stages",
        nargs="+",
        choices=["data_prep", "train", "evaluate", "export", "all"],
        default=["all"],
        help="Pipeline stages to run (default: all)",
    )
    parser.add_argument(
        "--model",
        default="xgboost",
        choices=["xgboost", "neural_net", "transformer"],
        help="Model config to use (default: xgboost)",
    )
    parser.add_argument(
        "--experiment",
        default=None,
        help="MLflow experiment name override",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print commands without executing",
    )
    args = parser.parse_args()

    # Resolve stages to run
    stages_to_run: list[str]
    if "all" in args.stages:
        stages_to_run = STAGE_ORDER
    else:
        # Preserve canonical order
        stages_to_run = [s for s in STAGE_ORDER if s in args.stages]

    # Build Hydra overrides
    overrides: list[str] = [f"model={args.model}"]
    if args.experiment:
        overrides.append(f"registry.experiment_name={args.experiment}")

    print(f"Pipeline stages: {' → '.join(stages_to_run)}")
    print(f"Model config  : {args.model}")
    if args.experiment:
        print(f"Experiment    : {args.experiment}")
    if args.dry_run:
        print("[dry-run] No stages will be executed.\n")
        for stage in stages_to_run:
            module = STAGE_MODULES[stage]
            cmd = [sys.executable, "-m", module] + overrides
            print(f"  {' '.join(cmd)}")
        return

    failed_stages: list[str] = []
    for stage in stages_to_run:
        rc = run_stage(stage, overrides)
        if rc != 0:
            failed_stages.append(stage)
            print(f"\n[ABORT] Stage '{stage}' failed. Stopping pipeline.", file=sys.stderr)
            break

    print("\n=== Pipeline Summary ===")
    completed = [s for s in stages_to_run if s not in failed_stages]
    if completed:
        print(f"  Completed : {', '.join(completed)}")
    if failed_stages:
        print(f"  Failed    : {', '.join(failed_stages)}")
        sys.exit(1)
    else:
        print("  All stages completed successfully.")


if __name__ == "__main__":
    main()
