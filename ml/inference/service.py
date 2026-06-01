from typing import List, Dict, Any

from ml.inference.predictor import Predictor
from ml.inference.metrics_writer import update_from_batch_result
from ml.config import configure_logging

logger = configure_logging(__name__)

predictor = Predictor()


def score_batch(records: List[Dict[str, Any]], explain: bool = False) -> List[Dict[str, Any]]:
    # Call predict_batch directly — builds feature matrices once for the whole
    # batch instead of once per record.
    results = predictor.predict_batch(records, explain=explain)
    update_from_batch_result(results)
    logger.info("Scored batch of %d records", len(records))
    return results
