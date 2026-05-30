# scripts/run_predict.py
import datetime
from db_client import get_db  # your own helper
from model import load_model, build_features  # your existing code

def main(reference_date=None):
    db = get_db()
    today = reference_date or datetime.date.today().isoformat()

    # 1) Fetch candidate tracks and features
    tracks = db.fetch_candidate_tracks(date=today)  # you define this query
    X, track_ids, code2s = build_features(tracks)

    # 2) Load model and predict
    model = load_model()
    viral_scores = model.predict_proba(X)[:, 1]  # or whatever shape
    rights_scores = model.predict_rights(X)      # if separate

    # 3) Upsert into talent_scout_scores
    for track_id, code2, v_score, r_score in zip(track_ids, code2s, viral_scores, rights_scores):
        db.upsert_talent_scout_score(
            track_id=track_id,
            code2=code2,
            date=today,
            viral_score=float(v_score),
            rights_complexity_score=float(r_score),
        )

if __name__ == "__main__":
    main()
