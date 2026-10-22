# Aviary — Bird Species Classification

A full local implementation inspired by the supplied Base44 screen recording. The frontend reproduces the light editorial layout, three-stage classifier, model metrics, and sample-bird gallery. The backend runs **the real, existing PyTorch EfficientNetB0 checkpoint** — it does not simulate classifications or retrain the model.

## Requirements

- VS Code
- Node.js 20+ and npm
- Python 3.10+ (Python 3.11 or 3.12 recommended)
- Internet connection for the first dependency installation; the actual model runs locally on CPU

## Start the backend (Terminal 1)

Open this folder in VS Code, then in the terminal:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

For Windows PowerShell, activate using `.venv\Scripts\Activate.ps1` instead. The model is loaded from `backend/assets/final.pt`; it **does not** require a new download from ImageNet or any training dataset.

Check http://localhost:8000/health — the response should include `"model_files_present": true`.

## Start the frontend (Terminal 2)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

Click a sample photograph or upload your own JPG/PNG image, then click **Identify this bird**. Predictions come from the backend at `http://localhost:8000/predict`.

If the API runs at another location, copy `frontend/.env.example` to `frontend/.env` and change `VITE_API_BASE`, then restart `npm run dev`. For deployment across domains, configure `AVIARY_ALLOWED_ORIGINS` on the backend as comma-separated full origins.

## File structure

```text
Aviary_Bird_Classifier_VSCode/
├── backend/
│   ├── assets/
│   │   ├── final.pt             # Original evaluated checkpoint
│   │   └── model_config.json   # Original architecture + 200 labels
│   ├── main.py                 # FastAPI POST /predict and GET /health
│   ├── model_utils.py          # Original training architecture + transforms
│   └── requirements.txt
├── frontend/
│   ├── public/samples/         # Four bird photos from the supplied dataset
│   ├── src/App.jsx             # UI states + upload/predict/results
│   ├── src/styles.css          # Responsive Aviary visual styling
│   ├── .env.example
│   └── package.json
└── README.md
```

## Prediction contract

`POST /predict` accepts `multipart/form-data` with one `file` field (JPEG/PNG, <=10 MB). The response includes:

```json
{
  "predicted_species": "Cardinal",
  "confidence": 0.82,
  "top5": [{"class_id":16,"species":"Cardinal","confidence":0.82}],
  "model": "efficientnet_b0",
  "num_classes": 200,
  "input_size": 224,
  "inference_ms": 90.5
}
```

Values shown here illustrate the response schema; the server returns **actual inferred values** for each image. The model is constructed with `pretrained=False` to avoid an ImageNet download, then the exact trained `state_dict` is loaded and the model runs in evaluation mode. Preprocessing uses the same resize, centre-crop, ImageNet normalisation and class-name order as `model_utils.py` and `model_config.json`.

## Accuracy and limitations

These metrics are taken from the original final held-out evaluation, **not** computed from new uploaded photos:

- Top-1 accuracy: **79.57%**
- Mean accuracy per class: **79.03%**
- Top-5 accuracy: **94.52%**

The confidence bars reflect uncalibrated softmax scores, not guaranteed probabilities of correctness. The website intentionally does not invent Latin names, habitat descriptions, or other species metadata not present in the training configuration.

Example gallery photos originate from the supplied 200-class bird dataset, and are provided for local academic demonstration. Check source licensing/attribution requirements before making them publicly available.

## Submission note

Your original coursework described Gradio/Hugging Face. This implementation uses **React + FastAPI**, reflecting your request to reproduce the Base44 wireframe in VS Code. Obtain lecturer approval if a particular deployment framework remains compulsory.
