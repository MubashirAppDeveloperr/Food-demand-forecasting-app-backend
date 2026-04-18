# Food demand forecasting API

Express + MongoDB. Forecasting and retraining call the **Python ML service** (ARIMA, XGBoost, LSTM).

## Requirements

- Node.js **18+** (global `fetch`)
- MongoDB
- Python **3.9+** with [../ml-service/README.md](../ml-service/README.md) dependencies (macOS: `brew install libomp` for XGBoost)

## Configuration

Copy [.env.example](.env.example) to **`.env` in this folder** (next to `server.js`) and set:

- `MONGODB_URI`, `PORT`, JWT secrets
- **`ML_SERVICE_URL`** — e.g. `http://127.0.0.1:8000` (must match where uvicorn listens)
- Optional: `ML_SERVICE_SECRET` / `ML_SERVICE_TIMEOUT_MS`

## Run order (local)

1. MongoDB
2. **ML service**: `cd ../ml-service && source .venv/bin/activate && uvicorn app.main:app --host 127.0.0.1 --port 8000`
3. **API**: `npm install && npm run dev` (from this folder)
4. **Frontend** ([../project-foundation](../project-foundation)): set `VITE_API_URL` to this API (e.g. `http://localhost:5001/api`) and `npm run dev`

## Data volume

Forecasting needs at least **42 days** of daily sales in MongoDB (after filters). The seed script creates 90 days of sample records (`npm run seed`).
