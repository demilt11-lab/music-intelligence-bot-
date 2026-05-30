# scripts/run_predict.py
from typing import List, Dict, Any

from ml.inference.service import score_batch

def main():
    # Minimal dummy record – adjust to match your real feature schema
    records: List[Dict[str, Any]] = [
        {
            "sound_id": "dummy",
            "snapshot_at": "2026-05-30T00:00:00",
            "video_count": 100,
            "view_count": 10000,
            "like_count": 500,
            "share_count": 50,
            "comment_count": 20,
            "velocity_score": 3.2,
            # plus audio_vec_0 ... audio_vec_N fields in real usage
        }
    ]
    result = score_batch(records, explain=True)
    print(result)

if __name__ == "__main__":
    main()
