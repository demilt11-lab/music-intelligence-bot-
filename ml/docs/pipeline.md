# ML Training Pipeline

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    ML Training Pipeline                          │
│                                                                  │
│  ┌─────────────┐   ┌──────────────┐   ┌────────────────────┐   │
│  │  data_prep  │──▶│    train     │──▶│     evaluate       │   │
│  │             │   │              │   │                    │   │
│  │ • Supabase  │   │ • XGBoost    │   │ • AUROC/F1/MCC     │   │
│  │   / synth   │   │ • Neural Net │   │ • Plots (dark)     │   │
│  │ • Features  │   │ • HPO Optuna │   │ • HTML report      │   │
│  │ • Validate  │   │ • MLflow log │   │ • Model compare    │   │
│  │ • Parquet   │   │ • Checkpoint │   │                    │   │
│  └─────────────┘   └──────────────┘   └────────────────────┘   │
│                                               │                  │
│                         ┌─────────────────────┘                  │
│                         ▼                                        │
│                  ┌────────────┐   ┌──────────────────────────┐  │
│                  │  registry  │   │         export           │  │
│                  │            │   │                          │  │
│                  │ • Promote  │   │ • cloudpickle (.pkl)     │  │
│                  │   Staging  │   │ • ONNX (.onnx, optional) │  │
│                  │ • Promote  │   │ • Metadata JSON          │  │
│                  │   Prod     │   │ • Latency test           │  │
│                  │ • Archive  │   │ • InferenceWrapper       │  │
│                  └────────────┘   └──────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

Config layer: Hydra (ml/conf/)
Experiment tracking: MLflow
HPO: Optuna (TPE sampler)
```

## Stage Descriptions

| Stage | Module | Description |
|-------|--------|-------------|
| `data_prep` | `ml.pipeline.data_prep` | Load from Supabase (or synthetic fallback), engineer features, validate, split, save parquet splits + preprocessor |
| `train` | `ml.pipeline.train` | HPO with Optuna, train XGBoost + MLP baselines, log to MLflow, save checkpoints |
| `evaluate` | `ml.pipeline.evaluate` | Load test parquet, evaluate all checkpoints, generate plots + HTML report, log to MLflow |
| `export` | `ml.pipeline.export` | Export best model as cloudpickle + ONNX, run latency test, log artifacts |

## Running the Pipeline

### Full pipeline (all stages)
```bash
python -m ml.pipeline.run_pipeline
```

### Individual stages
```bash
python -m ml.pipeline.data_prep
python -m ml.pipeline.train
python -m ml.pipeline.evaluate
python -m ml.pipeline.export
```

### With model override
```bash
python -m ml.pipeline.run_pipeline --model xgboost
python -m ml.pipeline.run_pipeline --model neural_net
```

### Dry-run (print commands, no execution)
```bash
python -m ml.pipeline.run_pipeline --dry-run
```

## Config Overrides (Hydra)

Hydra allows inline overrides on any config key:

```bash
# Change epochs and batch size
python -m ml.pipeline.train training.epochs=50 training.batch_size=128

# Disable HPO
python -m ml.pipeline.train training.hyperparameter_search.enabled=false

# Use a different model config
python -m ml.pipeline.train model=xgboost

# Override a nested key
python -m ml.pipeline.train model.learning_rate=0.01 model.n_estimators=300

# Change processed data directory
python -m ml.pipeline.train paths.processed_dir=/tmp/my_data
```

## MLflow Tracking

1. Start the MLflow tracking server:
   ```bash
   mlflow server --host 0.0.0.0 --port 5000
   ```
   Or point to a remote URI:
   ```bash
   export MLFLOW_TRACKING_URI=https://my-mlflow-server.example.com
   ```

2. Open the UI: `http://localhost:5000`

3. Experiments are named after `project.name` (default: `music-viral-prediction`).

4. Each training run logs:
   - Parameters (model config + HPO result)
   - Metrics (`train_auroc`, `val_auroc`)
   - Artifacts (model checkpoints)

## Promoting a Model to Production

```python
from ml.pipeline.registry import ModelRegistry
from omegaconf import OmegaConf

cfg = OmegaConf.load("ml/conf/config.yaml")
registry = ModelRegistry(cfg)

# Check what's registered
versions = registry.list_versions("viral-music-predictor")

# Promote version 3 to Staging (requires auroc >= 0.75)
thresholds = {"auroc": 0.75}
promoted = registry.promote("viral-music-predictor", "3", "Staging", thresholds)

# Promote to Production (requires auroc >= 0.85, precision >= 0.70)
prod_thresholds = {"auroc": 0.85, "precision": 0.70}
registry.promote("viral-music-predictor", "3", "Production", prod_thresholds)

# Compare new model vs current production
deltas = registry.compare_with_production({"auroc": 0.88, "f1": 0.74}, "viral-music-predictor")
print(deltas)  # {"auroc": +0.02, "f1": +0.01}

# Archive old versions (keep 3 most recent per stage)
registry.archive_old("viral-music-predictor", keep_n=3)
```

## Inference API Usage

```python
from ml.pipeline.export import InferenceWrapper

wrapper = InferenceWrapper(
    model_path="exports/model_v1_0_0.pkl",
    preprocessor_path="data/processed/preprocessor.pkl",
)

# Single prediction
result = wrapper.predict({
    "entity_id": 12345,
    "momentum": 0.72,
    "breakout_prob": 0.45,
    "virality_score": 0.61,
    "confidence": 0.88,
    "stream_velocity": 0.34,
})
print(result.is_viral)           # True
print(result.viral_probability)  # 0.83
print(result.latency_ms)         # ~1.2

# Batch prediction
records = [
    {"entity_id": 1, "momentum": 0.5, "breakout_prob": 0.3, ...},
    {"entity_id": 2, "momentum": 0.9, "breakout_prob": 0.8, ...},
]
results = wrapper.predict_batch(records)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | No | Supabase project URL (falls back to synthetic data if unset) |
| `SUPABASE_SERVICE_KEY` | No | Supabase service role key |
| `MLFLOW_TRACKING_URI` | No | MLflow server URI (default: `http://localhost:5000`) |
