"""Inference-only API for the already evaluated EfficientNetB0 checkpoint.

No training, fine-tuning, test evaluation, or model substitution happens here.
"""
from __future__ import annotations

import io
import json
import logging
import os
import time
from functools import lru_cache
from pathlib import Path

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from .model_utils import build_model, get_transforms

log = logging.getLogger("aviary")
BASE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = BASE_DIR / "assets"
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/jpg"}

app = FastAPI(title="Aviary — Bird classifier", version="1.0.0")
origins = os.getenv("AVIARY_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origins],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class SpeciesMatch(BaseModel):
    class_id: int
    species: str
    confidence: float  # softmax fraction in [0,1], not a calibrated probability


class PredictionResponse(BaseModel):
    predicted_species: str
    confidence: float
    top5: list[SpeciesMatch]
    model: str
    num_classes: int
    input_size: int
    inference_ms: float


@lru_cache(maxsize=1)
def classifier():
    """Load the checkpoint once, without downloading ImageNet pretrained weights."""
    config_path = ASSETS_DIR / "model_config.json"
    checkpoint_path = ASSETS_DIR / "final.pt"
    if not config_path.exists() or not checkpoint_path.exists():
        raise FileNotFoundError("Model configuration or checkpoint is missing")

    config = json.loads(config_path.read_text(encoding="utf-8"))
    names = config["class_names"]
    if len(names) != config["num_classes"]:
        raise ValueError("Class-name list length differs from num_classes")

    device = torch.device("cpu")
    model, _ = build_model(
        config["model"],
        config["num_classes"],
        pretrained=False,
        dropout=config.get("dropout", 0.4),
    )
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=True)
    model.load_state_dict(checkpoint, strict=True)
    model.eval()
    _, transform = get_transforms(int(config["img_size"]), augment=False)
    log.info("Loaded %s checkpoint with %d classes", config["model"], len(names))
    return model, transform, config


@app.get("/health")
def health():
    """Lightweight health check; also reports whether model files are present."""
    return {
        "status": "ok",
        "model_files_present": (
            (ASSETS_DIR / "final.pt").is_file()
            and (ASSETS_DIR / "model_config.json").is_file()
        ),
    }


@app.post("/predict", response_model=PredictionResponse)
async def predict(file: UploadFile = File(...)):
    """Accept JPG/PNG image and return five actual checkpoint predictions."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Please upload a JPG or PNG image.")

    raw = await file.read(MAX_FILE_BYTES + 1)
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Maximum upload size is 10 MB.")

    try:
        with Image.open(io.BytesIO(raw)) as opened:
            if opened.format not in {"JPEG", "PNG"}:
                raise HTTPException(status_code=415, detail="Only JPG and PNG images are supported.")
            if opened.width * opened.height > MAX_PIXELS:
                raise HTTPException(status_code=413, detail="Image resolution is too large.")
            image = opened.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="This file is not a readable image.") from exc

    try:
        model, transform, config = classifier()
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        log.exception("Model unavailable")
        raise HTTPException(status_code=503, detail="The trained model could not be loaded.") from exc

    start = time.perf_counter()
    batch = transform(image).unsqueeze(0)
    with torch.inference_mode():
        logits = model(batch)
        scores = torch.softmax(logits[0], dim=0)
        values, indices = torch.topk(scores, k=min(5, len(config["class_names"])))

    names = config["class_names"]
    top5 = [
        SpeciesMatch(class_id=int(idx), species=names[int(idx)], confidence=float(val))
        for idx, val in zip(indices.tolist(), values.tolist())
    ]
    return PredictionResponse(
        predicted_species=top5[0].species,
        confidence=top5[0].confidence,
        top5=top5,
        model=config["model"],
        num_classes=config["num_classes"],
        input_size=config["img_size"],
        inference_ms=round((time.perf_counter() - start) * 1000, 1),
    )
