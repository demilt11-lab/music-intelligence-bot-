# ml/config.py
from pathlib import Path
import logging

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "models"
LOG_DIR = ROOT / "logs"
METRICS_DIR = LOG_DIR / "metrics"

for d in (DATA_DIR, MODEL_DIR, LOG_DIR, METRICS_DIR):
    d.mkdir(parents=True, exist_ok=True)

def configure_logging(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    fmt = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    fh = logging.FileHandler(LOG_DIR / f"{name}.log")
    fh.setFormatter(fmt)
    fh.setLevel(logging.INFO)

    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    ch.setLevel(logging.INFO)

    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger
