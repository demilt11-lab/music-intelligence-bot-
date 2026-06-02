# Music Intelligence ML Pipeline

## Models

### Track Trend Model (`ml/track_trend_model.py`)
Predicts whether a track is trending based on streaming velocity, playlist additions, and engagement signals. Uses XGBoost with scikit-learn preprocessing.

### Artist Trajectory Model (`ml/artist_trajectory_model.py`)
Predicts an artist's growth trajectory (rising, stable, declining) over the coming weeks based on historical streaming data, follower growth, and release cadence. Uses a combination of XGBoost and neural network layers.

### Artist Spotify Trend Model (`ml/artist_spotify_trend_model.py`)
Predicts Spotify-specific trend signals for artists using platform engagement metrics.

## Running Training Locally

Ensure the required environment variables are set (see below), then:

```bash
# Full track trend pipeline (export → train → predict → import)
npm run ml:track-trend:full

# Full artist trajectory pipeline
npm run ml:artist-trajectory:full

# Full viral signals pipeline
npm run ml:viral:full
```

To run individual steps manually:

```bash
# Export training data
npx ts-node scripts/export_track_trend_training.ts
npx ts-node scripts/export_artist_trajectory_features.ts

# Train models
python ml/track_trend_model.py --mode train --input output/track_trend_training.csv
python ml/artist_trajectory_model.py --mode train --input output/artist_trajectory_features.csv

# Generate predictions
python ml/track_trend_model.py --mode predict --input output/track_trend_training.csv --output output/track_trend_predictions.csv
python ml/artist_trajectory_model.py --mode predict --input output/artist_trajectory_features.csv --output output/artist_trajectory_predictions.csv

# Import predictions back to database
npx ts-node scripts/import_track_trend_predictions.ts
npx ts-node scripts/import_artist_trajectory_predictions.ts
```

## Running the Inference Service

```bash
# Development
uvicorn ml.api.artist_trajectory_service:app --host 0.0.0.0 --port 8000 --reload

# Production
uvicorn ml.api.artist_trajectory_service:app --host 0.0.0.0 --port 8000 --workers 4
```

## GitHub Actions

### Training Pipeline (`ml_train.yml`)
- **Manual trigger:** Go to Actions tab → "ML Training Pipeline" → "Run workflow"
- **Scheduled:** Runs automatically every Sunday at 2am UTC
- Exports data, trains both models, imports predictions, and uploads model artifacts

### Inference Service (`ml_inference_service.yml`)
- **Manual trigger only:** Go to Actions tab → "ML Inference Service" → "Run workflow"
- Downloads the latest model artifacts and prints deployment instructions

## Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Prisma connection string (pooled) |
| `DIRECT_URL` | Direct database connection string (for migrations) |

For local development, add these to a `.env` file in the project root. For GitHub Actions, add them as repository secrets under Settings → Secrets and variables → Actions.
