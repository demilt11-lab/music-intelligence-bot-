# ml/features/collect_features.py
import time
import random
from typing import Callable, Type, Tuple

from ml.config import configure_logging

logger = configure_logging(__name__)

def exponential_backoff_with_jitter(
    func: Callable,
    exceptions: Tuple[Type[BaseException], ...],
    max_retries: int = 5,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
):
    def wrapper(*args, **kwargs):
        delay = base_delay
        for attempt in range(1, max_retries + 1):
            try:
                return func(*args, **kwargs)
            except exceptions as e:
                if attempt == max_retries:
                    logger.error(
                        "Max retries exceeded for %s: %s", func.__name__, e, exc_info=True
                    )
                    raise
                jitter = random.uniform(0, delay)
                sleep_for = min(delay + jitter, max_delay)
                logger.warning(
                    "Error in %s (attempt %d/%d): %s. Sleeping %.2fs",
                    func.__name__,
                    attempt,
                    max_retries,
                    e,
                    sleep_for,
                )
                time.sleep(sleep_for)
                delay *= 2
    return wrapper
