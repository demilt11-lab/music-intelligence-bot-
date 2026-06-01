from typing import List, Dict, Any

from ml.inference.predictor import Predictor
from ml.inference.metrics_writer import update_from_batch_result
from ml.config import configure_logging

logger = configure_logging(__name__)

predictor = Predictor()


def score_batch(records: List[Dict[str, Any]], explain: bool = False) -> List[Dict[str, Any]]:
    results = [predictor.predict(rec, explain=explain) for rec in records]
    update_from_batch_result(results)
    logger.info("Scored batch of %d records", len(records))
    return results
