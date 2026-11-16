# Pet-Finder

Pet-Finder is a lost-and-found pet reporting platform with real OpenCLIP image embeddings, Gemini-powered image descriptions and match explanations, and authenticated private chat.

## Features

- Separate lost and found reports with required photo uploads.
- OpenCV image decoding and OpenCLIP embeddings; candidate scores use cosine similarity over real embeddings. Reports without a usable image embedding cannot be matched.
- Optional Google Gemini image analysis, structured JSON descriptions, match explanations, and a platform assistant. AI features return a configuration/provider error when unavailable; they do not substitute mock results.
- JWT account registration and login, a user dashboard, report details, and an admin dashboard.
- Private uploaded photographs served through authenticated API routes, not a public static directory.
- Authenticated WebSocket chat. A conversation can only be opened by the owners of the two reports when their stored image embeddings meet the visual-match threshold.
- Opt-in approximate map locations, real match/message notifications, Gemini-powered Paw AI, and printable missing-pet posters with report QR codes.
- Community reunion stories appear only after a report owner or administrator marks a real report as reunited.
- MongoDB when available. The backend retains its local JSON document-store fallback for development; use MongoDB for shared or production deployments.

## Requirements

- Node.js 20.19+ (or 22.12+) and npm.
- Python 3.10+.
- MongoDB recommended; local development falls back to `backend\data\database.json`.
- A Google Gemini API key for image descriptions, match explanations, and AI assistant answers. Image matching itself uses OpenCLIP and does not require Gemini.
- The first image-processing request downloads the OpenCLIP model and requires network access and available disk/RAM.

## Configure the backend

From the project root in PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set a unique, random `JWT_SECRET` (at least 32 characters). Set `MONGODB_URI` to your MongoDB server and add `GEMINI_API_KEY` to enable Gemini features. Keep `.env` private; no API key is used by the browser.
`FRONTEND_ORIGINS` is a comma-separated CORS allowlist, and `FRONTEND_URL` is used to create report links in missing-pet posters. The older `ALLOWED_ORIGINS` setting remains supported as a fallback.

```powershell
py -3 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install --upgrade pip
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
backend\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

The REST API documentation is available at `http://localhost:8000/docs`; health check: `http://localhost:8000/api/health`.

If `JWT_SECRET` is omitted during local development, the API creates a temporary process-local signing key and logs a warning. Sessions will stop working after a backend restart. Always configure a stable, private key outside local development.

New databases do not contain demo users or sample pet reports. To provision an administrator, first register the intended account, then grant the role directly in MongoDB using its email:

```javascript
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { role: "admin", is_admin: true } }
)
```

Only grant administrator access to an account whose ownership you have verified out of band.

## Start the frontend

In another PowerShell window:

```powershell
Set-Location frontend
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). To use a non-default API URL, set `VITE_API_URL` in `frontend\.env.local`, for example:

```text
VITE_API_URL=http://localhost:8000
```

Add the frontend origin to `FRONTEND_ORIGINS` in the root `.env` if it differs from the defaults.

## API workflow

1. Register or log in in the web app.
2. Submit a lost or found report with a JPG, PNG, or WebP photo (10 MB maximum).
3. The backend decodes the upload with OpenCV, computes its OpenCLIP embedding, stores it with the report, and ranks opposite-status reports by cosine similarity.
4. When `GEMINI_API_KEY` is configured, Gemini also returns structured visible-feature analysis and a concise description. The report remains usable for OpenCLIP matching if Gemini is not configured.
5. Review potential matches and optionally request a Gemini comparison explanation. Start an in-app conversation only with the owner/finder of the qualifying reports.

All similarity values are computed from image embeddings. A match score or AI description is not proof of identity.

## Validation

```powershell
Set-Location frontend
npm run build
npm run lint
```

Run the backend startup smoke check from the project root after installing its dependencies:

```powershell
backend\.venv\Scripts\python.exe backend\test_backend.py
```

Backend syntax can also be checked from the project root with:

```powershell
backend\.venv\Scripts\python.exe -m compileall backend\app
```
