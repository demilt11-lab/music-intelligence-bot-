"""
Python watchdog that monitors for retrain trigger file and runs training.
Can be run as a long-running process alongside the Next.js app.

Usage: python -m ml.self_teaching.watchdog [--interval 3600] [--trigger-file ml/outputs/.retrain_trigger]
"""
import argparse
import json
import logging
import logging.handlers
import signal
import sys
import time
from pathlib import Path

log = logging.getLogger(__name__)

SEVEN_DAYS_S = 7 * 24 * 3600


def _setup_logging(log_path: str) -> None:
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    file_handler = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=5 * 1024 * 1024, backupCount=3
    )
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(fmt)
    root.addHandler(stream_handler)


# ---------------------------------------------------------------------------
# Watchdog
# ---------------------------------------------------------------------------

class Watchdog:
    """Polls for trigger file and runs weekly retraining loop."""

    def __init__(self, interval: int, trigger_file: str, cfg) -> None:
        self.interval = interval
        self.trigger_file = Path(trigger_file)
        self.cfg = cfg
        self._running = False
        self._last_scheduled_run: float = time.time()

    def run(self) -> None:
        self._running = True
        signal.signal(signal.SIGTERM, self._shutdown)
        signal.signal(signal.SIGINT, self._shutdown)

        log.info(
            "Watchdog started — polling every %ds, trigger file: %s",
            self.interval, self.trigger_file,
        )

        while self._running:
            # Check trigger file
            if self.trigger_file.exists():
                try:
                    raw = self.trigger_file.read_text(encoding="utf-8")
                    trigger_data = json.loads(raw) if raw.strip() else {}
                except Exception as exc:
                    log.warning("Could not parse trigger file: %s", exc)
                    trigger_data = {}
                # Delete before running to avoid double-trigger
                try:
                    self.trigger_file.unlink()
                except OSError:
                    pass
                self._handle_trigger(trigger_data)
                self._last_scheduled_run = time.time()

            # Weekly scheduled run (no trigger required)
            elif time.time() - self._last_scheduled_run >= SEVEN_DAYS_S:
                log.info("Scheduled weekly retraining run")
                self._handle_trigger({"triggered_by": "scheduled_weekly", "new_labeled_cases": 0})
                self._last_scheduled_run = time.time()

            time.sleep(self.interval)

        log.info("Watchdog shut down cleanly.")

    def _handle_trigger(self, trigger_data: dict) -> None:
        new_labeled_cases = int(trigger_data.get("new_labeled_cases", 0))
        triggered_by = trigger_data.get("triggered_by", "unknown")
        log.info(
            "Retraining triggered by '%s' with %d new labeled cases",
            triggered_by, new_labeled_cases,
        )
        try:
            from ml.self_teaching.weekly_trainer import WeeklyTrainer
            trainer = WeeklyTrainer(self.cfg)
            result = trainer.run(new_labeled_cases=new_labeled_cases)
            log.info(
                "Retraining complete — action=%s, delta=%.4f, version=%s",
                result.action, result.accuracy_delta, result.new_version,
            )
        except Exception as exc:
            log.exception("Retraining failed: %s", exc)

    def _shutdown(self, signum, frame) -> None:
        log.info("Received signal %s — shutting down watchdog", signum)
        self._running = False


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="ML retraining watchdog")
    parser.add_argument("--interval", type=int, default=3600, help="Poll interval in seconds")
    parser.add_argument(
        "--trigger-file",
        default="ml/outputs/.retrain_trigger",
        help="Path to trigger file",
    )
    parser.add_argument("--log-file", default="ml/outputs/watchdog.log")
    parser.add_argument("--store-dir", default="ml/outputs/model_store")
    parser.add_argument("--data-dir", default="ml/outputs/training_data")
    parser.add_argument("--hp-search", action="store_true", default=False)
    args = parser.parse_args()

    Path("ml/outputs").mkdir(parents=True, exist_ok=True)
    _setup_logging(args.log_file)

    from ml.self_teaching.weekly_trainer import RetrainingConfig
    cfg = RetrainingConfig(
        store_dir=args.store_dir,
        data_dir=args.data_dir,
        run_hyperparameter_search=args.hp_search,
    )

    watchdog = Watchdog(interval=args.interval, trigger_file=args.trigger_file, cfg=cfg)
    watchdog.run()


if __name__ == "__main__":
    main()
