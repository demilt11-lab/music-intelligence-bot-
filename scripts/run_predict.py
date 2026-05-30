# scripts/run_predict.py
from typing import List, Dict, Any
from ml.inference.service import score_batch

if __name__ == "__main__":
    # Example single record; replace with real input
    dummy_records: List[Dict[str, Any]] = [
        {
            "sound_id": "dummy",
            "snapshot_at": "2026-05-30T00:00:00",
            "video_count": 100,
            "view_count": 10000,
            "like_count": 500,
            "share_count": 50,
            "comment_count": 20,
            # plus audio_vec_* fields etc.
        }
    ]
    res = score_batch(dummy_records, explain=True)
    print(res)
