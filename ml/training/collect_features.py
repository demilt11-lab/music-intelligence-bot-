# ml/training/collect_features.py
import os
import json
import requests
from typing import List, Dict

API_BASE = os.environ.get("API_BASE", "https://your-api-host.com")
API_KEY = os.environ.get("API_KEY")

HEADERS = {
    "x-api-key": API_KEY,
}

def get_track_ids() -> List[int]:
    # TODO: pull from your DB or an export of tracks of interest.
    # For now, read from a JSON file or hardcode.
    return []

def fetch_features(track_id: int) -> Dict:
    url = f"{API_BASE}/api/v1/tracks/{track_id}/features"
    resp = requests.get(url, headers=HEADERS, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    return data["obj"]

def main():
    track_ids = get_track_ids()
    rows = []

    for tid in track_ids:
        try:
          feat = fetch_features(tid)
        except Exception as e:
          print(f"Error fetching features for {tid}: {e}")
          continue

        # Placeholder: no label yet
        rows.append({
            "trackId": feat["trackId"],
            "features": feat,
            "label": None,  # fill later
        })

    os.makedirs("output/data", exist_ok=True)
    with open("output/data/trajectory_features.json", "w") as f:
        json.dump(rows, f, indent=2)

if __name__ == "__main__":
    main()
