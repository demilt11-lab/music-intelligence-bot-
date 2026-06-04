"""
Inference script for ViralTransformer.

Usage:
    python -m ml.scripts.inference \
        --checkpoint /path/to/checkpoint.pt \
        --input /path/to/input.json \
        --output /path/to/predictions.json \
        --device cuda

Input JSON format:
    {
        "audio_features": [[float, ...], ...],   # (T_audio, 128) — pre-extracted audio frames
        "timeseries": [[float, ...], ...],        # (T_ts, 8) — engagement timeseries
        "title": "Song Title",
        "lyrics": "Lyrics text ...",
        "captions": "Caption text ...",
        "artist_id": 123,
        "genre_id": 7,
        "release_date": "2024-03-15",
        "continuous_meta": [float, ...]           # 8 values: bpm, duration_s, key, mode,
                                                  #   time_signature, energy, valence, danceability
    }

Output JSON format:
    {
        "viral_prob": float,           # probability in [0, 1]
        "days_to_viral": float,        # predicted days until viral event
        "peak_score": float,           # predicted peak popularity score in [0, 100]
        "top_clip_segments": [int, ...]  # top-3 recommended clip frame indices
    }
"""

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run ViralTransformer inference on a single input JSON record"
    )
    parser.add_argument(
        "--checkpoint",
        type=str,
        required=True,
        help="Path to a saved model checkpoint (.pt file)",
    )
    parser.add_argument(
        "--input",
        type=str,
        required=True,
        help="Path to the input JSON file",
    )
    parser.add_argument(
        "--output",
        type=str,
        required=True,
        help="Path to write the output predictions JSON",
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cuda",
        help="Device to run inference on: cuda or cpu (default: cuda)",
    )
    return parser.parse_args()


def encode_date_features(date_str: str) -> List[float]:
    """Encode a YYYY-MM-DD date string into 5 cyclic + normalised features."""
    from datetime import date as dt_cls

    try:
        d = dt_cls.fromisoformat(date_str)
    except (ValueError, TypeError):
        return [0.0, 1.0, 0.0, 1.0, 0.5]

    sin_month = math.sin(2 * math.pi * (d.month - 1) / 12)
    cos_month = math.cos(2 * math.pi * (d.month - 1) / 12)
    dow = d.weekday()
    sin_dow = math.sin(2 * math.pi * dow / 7)
    cos_dow = math.cos(2 * math.pi * dow / 7)
    year_norm = (d.year - 2010) / 20.0

    return [sin_month, cos_month, sin_dow, cos_dow, year_norm]


def simple_tokenize(text: str, vocab_size: int = 30522, max_length: int = 512) -> List[int]:
    """Minimal whitespace tokenizer — matches the SimpleTokenizer used in dataset.py."""
    cls_token_id = 101
    sep_token_id = 102
    pad_token_id = 0
    unk_token_id = 100

    words = text.lower().split()
    token_ids = [cls_token_id]
    for word in words:
        tid = (hash(word) % (vocab_size - 1000)) + 1000
        token_ids.append(tid)
    token_ids.append(sep_token_id)

    if len(token_ids) > max_length:
        token_ids = token_ids[: max_length - 1] + [sep_token_id]

    return token_ids


def build_model_inputs(record: Dict[str, Any], device: "torch.device"):  # noqa: F821
    """Convert a raw input dict into tensors ready for ViralTransformer.forward()."""
    import torch

    # ── Audio features (T_audio, 128) ─────────────────────────────────────
    audio_np = record.get("audio_features", [[0.0] * 128])
    audio_tensor = torch.tensor(audio_np, dtype=torch.float32).unsqueeze(0)  # (1, T, 128)

    # ── Timeseries (T_ts, 8) ──────────────────────────────────────────────
    ts_np = record.get("timeseries", [[0.0] * 8])
    ts_tensor = torch.tensor(ts_np, dtype=torch.float32).unsqueeze(0)  # (1, T, 8)

    # ── Text: concatenate title + lyrics + captions ───────────────────────
    title = record.get("title", "")
    lyrics = record.get("lyrics", "")
    captions = record.get("captions", "")
    combined_text = f"{title} {lyrics} {captions}".strip()
    token_ids = simple_tokenize(combined_text)
    input_ids = torch.tensor([token_ids], dtype=torch.long)  # (1, T_text)

    # ── Metadata ──────────────────────────────────────────────────────────
    artist_id = int(record.get("artist_id", 0))
    genre_id = int(record.get("genre_id", 0))
    release_date = record.get("release_date", "2020-01-01")
    date_features = encode_date_features(release_date)

    continuous_meta = record.get("continuous_meta", [0.0] * 8)
    if len(continuous_meta) < 8:
        continuous_meta = continuous_meta + [0.0] * (8 - len(continuous_meta))
    continuous_meta = continuous_meta[:8]

    artist_ids = torch.tensor([artist_id], dtype=torch.long)
    genre_ids = torch.tensor([genre_id], dtype=torch.long)
    date_feat_tensor = torch.tensor([date_features], dtype=torch.float32)
    cont_meta_tensor = torch.tensor([continuous_meta], dtype=torch.float32)

    # Move all tensors to device
    return {
        "audio_features": audio_tensor.to(device),
        "audio_mask": None,
        "timeseries": ts_tensor.to(device),
        "ts_mask": None,
        "input_ids": input_ids.to(device),
        "text_attention_mask": None,
        "artist_ids": artist_ids.to(device),
        "genre_ids": genre_ids.to(device),
        "date_features": date_feat_tensor.to(device),
        "continuous_meta": cont_meta_tensor.to(device),
    }


def main() -> None:
    args = parse_args()

    import torch
    from ml.models import ViralTransformer

    # ── Resolve device ─────────────────────────────────────────────────────
    device_str = args.device
    if device_str == "cuda" and not torch.cuda.is_available():
        print("WARNING: CUDA not available, falling back to CPU", file=sys.stderr)
        device_str = "cpu"
    device = torch.device(device_str)

    # ── Load checkpoint ────────────────────────────────────────────────────
    checkpoint_path = Path(args.checkpoint)
    if not checkpoint_path.exists():
        print(f"ERROR: checkpoint not found: {checkpoint_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading checkpoint from {checkpoint_path} ...")
    state = torch.load(str(checkpoint_path), map_location=device)

    # Support both raw state dicts and wrapped checkpoints
    if isinstance(state, dict) and "model_state_dict" in state:
        model_state = state["model_state_dict"]
        # Try to restore model config if saved
        model_config = state.get("model_config", {})
    else:
        model_state = state
        model_config = {}

    model = ViralTransformer(**model_config)
    model.load_state_dict(model_state)
    model.to(device)
    model.eval()
    print(
        f"Model loaded ({sum(p.numel() for p in model.parameters()):,} parameters)."
    )

    # ── Load input ─────────────────────────────────────────────────────────
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    with open(input_path, "r") as f:
        record = json.load(f)

    print(f"Running inference on '{record.get('title', '<no title>')}'...")

    # ── Build tensors and run forward pass ─────────────────────────────────
    inputs = build_model_inputs(record, device)

    with torch.no_grad():
        output = model.forward(
            audio_features=inputs["audio_features"],
            audio_mask=inputs["audio_mask"],
            timeseries=inputs["timeseries"],
            ts_mask=inputs["ts_mask"],
            input_ids=inputs["input_ids"],
            text_attention_mask=inputs["text_attention_mask"],
            artist_ids=inputs["artist_ids"],
            genre_ids=inputs["genre_ids"],
            date_features=inputs["date_features"],
            continuous_meta=inputs["continuous_meta"],
            return_clip_logits=True,
        )

    # ── Extract predictions ────────────────────────────────────────────────
    viral_prob = float(output.viral_prob.squeeze().cpu().item())
    days_to_viral = float(output.days_to_viral.squeeze().cpu().item())
    peak_score = float(output.peak_score.squeeze().cpu().item())

    top_clip_segments: List[int] = []
    if output.clip_logits is not None:
        # Get top-3 frame indices
        clip_probs = torch.softmax(output.clip_logits.squeeze(0), dim=-1)
        _, top_indices = torch.topk(clip_probs, k=min(3, clip_probs.size(0)))
        top_clip_segments = top_indices.cpu().tolist()

    predictions = {
        "viral_prob": viral_prob,
        "days_to_viral": days_to_viral,
        "peak_score": peak_score,
        "top_clip_segments": top_clip_segments,
    }

    # ── Write output ───────────────────────────────────────────────────────
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(predictions, f, indent=2)

    print(f"Predictions written to {output_path}")
    print(f"  viral_prob:        {viral_prob:.4f}")
    print(f"  days_to_viral:     {days_to_viral:.1f}")
    print(f"  peak_score:        {peak_score:.1f}")
    print(f"  top_clip_segments: {top_clip_segments}")


if __name__ == "__main__":
    main()
