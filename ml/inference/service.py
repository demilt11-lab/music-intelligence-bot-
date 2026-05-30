# ml/inference/service.py
from typing import List, Dict, Any

from ml.inference.predictor import Predictor
from ml.inference.metrics_writer import update_viral_prob_metrics
from ml.config import configure_logging

logger = configure_logging(__name__)

predictor = Predictor()

def score_batch(records: List[Dict[str, Any]], explain: bool = False):
    results = []
    probs = []
    for rec in records:
        res = predictor.predict(rec, explain=explain)
        results.append(res)
        probs.append(res["viral_probability"])
    if probs:
        update_viral_prob_metrics(probs)
    logger.info("Scored batch of %d records", len(records))
    return results
