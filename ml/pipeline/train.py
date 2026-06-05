"""
Training pipeline: loads preprocessed data, trains multiple models,
performs hyperparameter search, saves checkpoints, logs to MLflow.
"""
import logging
import pickle
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

try:
    import hydra
except ImportError:
    hydra = None
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
try:
    from omegaconf import DictConfig, OmegaConf
except ImportError:
    DictConfig = dict
    OmegaConf = None
from sklearn.metrics import roc_auc_score

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class TrainingResult:
    model_name: str
    model: Any
    train_auroc: float
    val_auroc: float
    params: dict = field(default_factory=dict)
    checkpoint_path: str = ""


# ---------------------------------------------------------------------------
# Model factory
# ---------------------------------------------------------------------------


class ModelFactory:
    """Creates model instances from Hydra model config."""

    @staticmethod
    def create(cfg: DictConfig) -> Any:
        model_type = cfg.model.type

        if model_type == "xgboost":
            from xgboost import XGBClassifier

            return XGBClassifier(
                n_estimators=cfg.model.get("n_estimators", 500),
                max_depth=cfg.model.get("max_depth", 6),
                learning_rate=cfg.model.get("learning_rate", 0.05),
                subsample=cfg.model.get("subsample", 0.8),
                colsample_bytree=cfg.model.get("colsample_bytree", 0.8),
                min_child_weight=cfg.model.get("min_child_weight", 3),
                gamma=cfg.model.get("gamma", 0.1),
                reg_alpha=cfg.model.get("reg_alpha", 0.1),
                reg_lambda=cfg.model.get("reg_lambda", 1.0),
                scale_pos_weight=cfg.model.get("scale_pos_weight", 3.0),
                eval_metric="auc",
                use_label_encoder=False,
                random_state=42,
                n_jobs=-1,
            )

        if model_type == "neural_net":
            hidden_dims = list(cfg.model.get("hidden_dims", [512, 256, 128, 64]))
            dropout = cfg.model.get("dropout", 0.3)
            use_bn = cfg.model.get("batch_norm", True)

            # Input dim is unknown at factory time; will be set in Trainer
            return _MLPFactory(hidden_dims=hidden_dims, dropout=dropout, use_bn=use_bn)

        if model_type == "transformer":
            from ml.models.viral_transformer import ViralTransformer

            return ViralTransformer(
                audio_dim=cfg.model.get("audio_dim", 128),
                timeseries_dim=cfg.model.get("timeseries_dim", 64),
                text_dim=cfg.model.get("text_dim", 256),
                metadata_dim=cfg.model.get("metadata_dim", 32),
                hidden_dim=cfg.model.get("hidden_dim", 256),
                num_heads=cfg.model.get("num_heads", 8),
                num_layers=cfg.model.get("num_layers", 4),
                dropout=cfg.model.get("dropout", 0.1),
                max_seq_len=cfg.model.get("max_seq_len", 512),
            )

        raise ValueError(f"Unknown model type: {model_type}")


class _MLPFactory:
    """Deferred MLP builder — builds the actual nn.Sequential once input_dim is known."""

    def __init__(self, hidden_dims: list[int], dropout: float, use_bn: bool) -> None:
        self.hidden_dims = hidden_dims
        self.dropout = dropout
        self.use_bn = use_bn

    def build(self, input_dim: int) -> nn.Sequential:
        layers: list[nn.Module] = []
        prev = input_dim
        for h in self.hidden_dims:
            layers.append(nn.Linear(prev, h))
            if self.use_bn:
                layers.append(nn.BatchNorm1d(h))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(self.dropout))
            prev = h
        layers.append(nn.Linear(prev, 1))
        layers.append(nn.Sigmoid())
        return nn.Sequential(*layers)


# ---------------------------------------------------------------------------
# Hyperparameter search (Optuna)
# ---------------------------------------------------------------------------


class HyperparameterSearcher:
    """Runs an Optuna study to find optimal XGBoost hyperparameters."""

    def search(
        self,
        train_df: pd.DataFrame,
        val_df: pd.DataFrame,
        cfg: DictConfig,
    ) -> dict:
        import optuna

        optuna.logging.set_verbosity(optuna.logging.WARNING)

        feature_cols = self._get_feature_cols(train_df)
        X_train = train_df[feature_cols].values
        y_train = train_df["is_viral"].values
        X_val = val_df[feature_cols].values
        y_val = val_df["is_viral"].values

        n_trials = cfg.training.hyperparameter_search.trials

        def objective(trial: optuna.Trial) -> float:
            from xgboost import XGBClassifier

            params = cfg.training.hyperparameter_search.params
            lr = trial.suggest_float(
                "learning_rate",
                params.learning_rate.low,
                params.learning_rate.high,
                log=params.learning_rate.get("log", True),
            )
            dropout_rate = trial.suggest_float(
                "dropout", params.dropout.low, params.dropout.high
            )
            batch_sz = trial.suggest_categorical(
                "batch_size", list(params.batch_size.choices)
            )
            wd = trial.suggest_float(
                "weight_decay",
                params.weight_decay.low,
                params.weight_decay.high,
                log=params.weight_decay.get("log", True),
            )

            model = XGBClassifier(
                n_estimators=200,
                learning_rate=lr,
                max_depth=6,
                subsample=0.8,
                colsample_bytree=0.8,
                use_label_encoder=False,
                eval_metric="auc",
                random_state=42,
                verbosity=0,
            )
            model.fit(X_train, y_train)
            y_prob = model.predict_proba(X_val)[:, 1]
            score = roc_auc_score(y_val, y_prob)

            trial.set_user_attr("batch_size", batch_sz)
            trial.set_user_attr("weight_decay", wd)
            trial.set_user_attr("dropout", dropout_rate)
            return score

        sampler = optuna.samplers.TPESampler(seed=42)
        pruner = optuna.pruners.MedianPruner()
        study = optuna.create_study(
            direction=cfg.training.hyperparameter_search.direction,
            sampler=sampler,
            pruner=pruner,
        )
        study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

        best = study.best_params
        best.update(study.best_trial.user_attrs)
        log.info("Best HPO params: %s  |  val_auroc: %.4f", best, study.best_value)
        return best

    @staticmethod
    def _get_feature_cols(df: pd.DataFrame) -> list[str]:
        exclude = {"id", "entity_id", "entity_type", "computed_at", "is_viral"}
        return [c for c in df.columns if c not in exclude and df[c].dtype != object]


# ---------------------------------------------------------------------------
# MLflow logger
# ---------------------------------------------------------------------------


class MLflowLogger:
    """Thin wrapper around MLflow tracking API."""

    def __init__(self, cfg: DictConfig) -> None:
        try:
            import mlflow

            tracking_uri = cfg.registry.tracking_uri
            mlflow.set_tracking_uri(tracking_uri)
            self.experiment = mlflow.set_experiment(cfg.registry.experiment_name)
            self._mlflow = mlflow
            self._enabled = True
            log.info("MLflow tracking URI: %s", tracking_uri)
        except Exception as exc:
            log.warning("MLflow unavailable (%s). Tracking disabled.", exc)
            self._enabled = False
            self._mlflow = None
            self.experiment = None

    def start_run(self, run_name: str, tags: Optional[dict] = None):
        if not self._enabled:
            return None
        return self._mlflow.start_run(run_name=run_name, tags=tags)

    def log_params(self, params: dict) -> None:
        if not self._enabled:
            return
        try:
            self._mlflow.log_params(params)
        except Exception as exc:
            log.warning("MLflow log_params failed: %s", exc)

    def log_metrics(self, metrics: dict, step: Optional[int] = None) -> None:
        if not self._enabled:
            return
        try:
            self._mlflow.log_metrics(metrics, step=step)
        except Exception as exc:
            log.warning("MLflow log_metrics failed: %s", exc)

    def log_artifact(self, path: str) -> None:
        if not self._enabled:
            return
        try:
            self._mlflow.log_artifact(path)
        except Exception as exc:
            log.warning("MLflow log_artifact failed: %s", exc)

    def log_model(self, model: Any, artifact_path: str, signature: Any = None) -> None:
        if not self._enabled:
            return
        try:
            import mlflow.sklearn

            mlflow.sklearn.log_model(model, artifact_path=artifact_path, signature=signature)
        except Exception as exc:
            log.warning("MLflow log_model failed: %s", exc)

    def end_run(self) -> None:
        if not self._enabled:
            return
        try:
            self._mlflow.end_run()
        except Exception as exc:
            log.warning("MLflow end_run failed: %s", exc)


# ---------------------------------------------------------------------------
# Trainer
# ---------------------------------------------------------------------------


class Trainer:
    """Model-agnostic trainer for sklearn and PyTorch models."""

    def __init__(self, mlflow_logger: MLflowLogger) -> None:
        self.logger = mlflow_logger

    def train_sklearn(
        self,
        model: Any,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        cfg: DictConfig,
        model_name: str = "model",
    ) -> TrainingResult:
        """Fit a sklearn-compatible model and compute AUROC."""
        log.info("Training %s on %d samples…", model_name, len(X_train))

        fit_kwargs: dict[str, Any] = {}

        # XGBoost supports eval_set for early stopping
        model_class_name = type(model).__name__
        if "XGB" in model_class_name:
            es = cfg.model.get("early_stopping_rounds", 50)
            fit_kwargs = {
                "eval_set": [(X_val, y_val)],
                "verbose": False,
            }
            # early_stopping_rounds is now an init param in newer XGBoost
            try:
                model.set_params(early_stopping_rounds=es)
            except Exception:
                pass

        model.fit(X_train, y_train, **fit_kwargs)

        train_prob = model.predict_proba(X_train)[:, 1]
        val_prob = model.predict_proba(X_val)[:, 1]
        train_auroc = float(roc_auc_score(y_train, train_prob))
        val_auroc = float(roc_auc_score(y_val, val_prob))

        log.info("%s — train_auroc: %.4f  val_auroc: %.4f", model_name, train_auroc, val_auroc)
        return TrainingResult(
            model_name=model_name,
            model=model,
            train_auroc=train_auroc,
            val_auroc=val_auroc,
        )

    def train_pytorch(
        self,
        model: nn.Module,
        train_loader: Any,
        val_loader: Any,
        cfg: DictConfig,
        model_name: str = "pytorch_model",
    ) -> TrainingResult:
        """Delegate to the existing ml.training.trainer.Trainer."""
        from ml.training.trainer import Trainer as PyTrainer, TrainerConfig

        pt_cfg = TrainerConfig(
            learning_rate=cfg.training.learning_rate,
            weight_decay=cfg.training.weight_decay,
            num_epochs=cfg.training.epochs,
            batch_size=cfg.training.batch_size,
            max_grad_norm=cfg.training.gradient_clip,
        )
        pt_trainer = PyTrainer(model=model, config=pt_cfg)
        metrics = pt_trainer.train(train_loader=train_loader, val_loader=val_loader)
        val_auroc = metrics.get("best_val_auroc", 0.0)
        return TrainingResult(
            model_name=model_name,
            model=model,
            train_auroc=metrics.get("final_train_auroc", 0.0),
            val_auroc=val_auroc,
        )

    def save_checkpoint(self, model: Any, path: str, metadata: dict) -> None:
        """Pickle model and attach metadata sidecar."""
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "wb") as f:
            pickle.dump({"model": model, "metadata": metadata}, f)
        log.info("Checkpoint saved to %s", p)


# ---------------------------------------------------------------------------
# Training pipeline
# ---------------------------------------------------------------------------


class TrainingPipeline:
    """Orchestrates model training, HPO, and logging."""

    def run(self, cfg: DictConfig) -> None:
        log.info("=== Training Pipeline ===")

        processed_dir = Path(cfg.paths.processed_dir)
        checkpoints_dir = Path(cfg.paths.checkpoints_dir)
        checkpoints_dir.mkdir(parents=True, exist_ok=True)

        # Load data ----------------------------------------------------------
        train_df = pd.read_parquet(processed_dir / "train.parquet", engine="pyarrow")
        val_df = pd.read_parquet(processed_dir / "val.parquet", engine="pyarrow")
        log.info("Loaded train (%d) and val (%d)", len(train_df), len(val_df))

        feature_cols = self._get_feature_cols(train_df)
        X_train = train_df[feature_cols].values.astype(np.float32)
        y_train = train_df["is_viral"].values
        X_val = val_df[feature_cols].values.astype(np.float32)
        y_val = val_df["is_viral"].values

        # HPO ----------------------------------------------------------------
        best_hpo_params: dict = {}
        if cfg.training.hyperparameter_search.enabled:
            log.info("Running hyperparameter search (%d trials)…", cfg.training.hyperparameter_search.trials)
            searcher = HyperparameterSearcher()
            best_hpo_params = searcher.search(train_df, val_df, cfg)

        # Logging ------------------------------------------------------------
        ml_logger = MLflowLogger(cfg)
        trainer = Trainer(ml_logger)

        results: dict[str, TrainingResult] = {}

        for model_type in ["xgboost", "neural_net"]:
            run_name = f"{model_type}_run"
            run = ml_logger.start_run(run_name=run_name, tags={"model_type": model_type})

            try:
                # Build temp config overlay for model type
                model_cfg = _build_model_cfg(cfg, model_type)

                if model_type == "xgboost":
                    if best_hpo_params.get("learning_rate"):
                        try:
                            model_cfg = OmegaConf.merge(
                                model_cfg,
                                {"model": {"learning_rate": best_hpo_params["learning_rate"]}},
                            )
                        except Exception:
                            pass
                    model = ModelFactory.create(model_cfg)
                    result = trainer.train_sklearn(
                        model, X_train, y_train, X_val, y_val, model_cfg, model_name=model_type
                    )

                elif model_type == "neural_net":
                    factory = _MLPFactory(
                        hidden_dims=list(cfg.model.get("hidden_dims", [512, 256, 128, 64]))
                        if cfg.model.type == "neural_net"
                        else [512, 256, 128, 64],
                        dropout=float(cfg.model.get("dropout", 0.3))
                        if cfg.model.type == "neural_net"
                        else 0.3,
                        use_bn=True,
                    )
                    mlp = factory.build(input_dim=X_train.shape[1])
                    result = self._train_mlp(
                        mlp, X_train, y_train, X_val, y_val, cfg, model_name=model_type
                    )

                else:
                    continue

                # Log to MLflow
                ml_logger.log_params({**result.params, "model_type": model_type})
                ml_logger.log_metrics(
                    {"train_auroc": result.train_auroc, "val_auroc": result.val_auroc}
                )
                ml_logger.log_model(result.model, artifact_path=model_type)

                # Save checkpoint
                ckpt_path = str(checkpoints_dir / f"{model_type}_best.pkl")
                trainer.save_checkpoint(
                    result.model,
                    ckpt_path,
                    metadata={
                        "model_type": model_type,
                        "val_auroc": result.val_auroc,
                        "feature_cols": feature_cols,
                    },
                )
                result.checkpoint_path = ckpt_path
                results[model_type] = result

            finally:
                ml_logger.end_run()

        # Select best --------------------------------------------------------
        if results:
            best_name = max(results, key=lambda k: results[k].val_auroc)
            best = results[best_name]
            log.info("Best model: %s  val_auroc=%.4f", best_name, best.val_auroc)

            # Register in MLflow model registry
            run2 = ml_logger.start_run(run_name="best_model_registration")
            try:
                ml_logger.log_metrics({"best_val_auroc": best.val_auroc})
                ml_logger.log_model(best.model, artifact_path="best_model")
            finally:
                ml_logger.end_run()

        log.info("=== Training Pipeline Complete ===")

    # ------------------------------------------------------------------

    def _get_feature_cols(self, df: pd.DataFrame) -> list[str]:
        exclude = {"id", "entity_id", "entity_type", "computed_at", "is_viral"}
        return [c for c in df.columns if c not in exclude and df[c].dtype != object]

    def _train_mlp(
        self,
        model: nn.Module,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        cfg: DictConfig,
        model_name: str = "neural_net",
    ) -> TrainingResult:
        """Simple PyTorch training loop for the MLP baseline."""
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = model.to(device)
        optimizer = torch.optim.AdamW(
            model.parameters(),
            lr=cfg.training.learning_rate,
            weight_decay=cfg.training.weight_decay,
        )
        criterion = nn.BCELoss()

        X_t = torch.tensor(X_train, dtype=torch.float32).to(device)
        y_t = torch.tensor(y_train, dtype=torch.float32).unsqueeze(1).to(device)
        X_v = torch.tensor(X_val, dtype=torch.float32).to(device)
        y_v = torch.tensor(y_val, dtype=torch.float32).unsqueeze(1).to(device)

        epochs = min(cfg.training.epochs, 30)  # cap for MLP quick baseline
        patience = cfg.training.early_stopping.patience
        best_val_auroc = 0.0
        best_state = None
        no_improve = 0

        for epoch in range(epochs):
            model.train()
            optimizer.zero_grad()
            pred = model(X_t)
            loss = criterion(pred, y_t)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.training.gradient_clip)
            optimizer.step()

            model.eval()
            with torch.no_grad():
                val_prob = model(X_v).cpu().numpy().ravel()
            val_auroc = float(roc_auc_score(y_val, val_prob))

            if val_auroc > best_val_auroc:
                best_val_auroc = val_auroc
                best_state = {k: v.clone() for k, v in model.state_dict().items()}
                no_improve = 0
            else:
                no_improve += 1
                if no_improve >= patience:
                    log.info("Early stopping at epoch %d", epoch)
                    break

        if best_state:
            model.load_state_dict(best_state)

        model.eval()
        with torch.no_grad():
            train_prob = model(X_t).cpu().numpy().ravel()
        train_auroc = float(roc_auc_score(y_train, train_prob))

        log.info("%s — train_auroc: %.4f  val_auroc: %.4f", model_name, train_auroc, best_val_auroc)
        return TrainingResult(
            model_name=model_name,
            model=model,
            train_auroc=train_auroc,
            val_auroc=best_val_auroc,
        )


def _build_model_cfg(cfg: DictConfig, model_type: str) -> DictConfig:
    """Build a config with the requested model type overridden."""
    overrides = OmegaConf.create(
        {
            "model": {
                "type": model_type,
                "name": f"{model_type}_baseline",
            }
        }
    )
    return OmegaConf.merge(cfg, overrides)


def main(cfg=None) -> None:
    TrainingPipeline().run(cfg)


if __name__ == "__main__":
    if hydra is not None:
        import functools
        hydra.main(config_path="../conf", config_name="config", version_base=None)(main)()
    else:
        main()
