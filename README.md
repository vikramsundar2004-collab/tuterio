# LumiMath MVP

Production-ready MVP for math tutoring with GPT + photo input.

## Features
- Modern responsive UI
- Help Mode and Solve Mode
- Text and photo problem input
- Python upscaling before model inference
- GPT model target set to `gpt-5.4` (fallback `gpt-5-mini`)
- In-memory API rate limiting
- Security headers + static file caching
- Health endpoint for uptime checks

## Local Setup
1. Install requirements
```powershell
cd C:\Users\vikra\OneDrive\Documents\Playground\study-app
python -m pip install --user pillow
```
2. Copy env file and fill key
```powershell
Copy-Item .env.example .env
```
3. Set environment variables in your shell
```powershell
$env:OPENAI_API_KEY="your_key_here"
$env:OPENAI_MODEL="gpt-5.4"
$env:NODE_ENV="production"
```
4. Run app
```powershell
node server.js
```
Open: `http://localhost:3000`

## Smoke Test
With server running:
```powershell
node scripts/smoke_test.js
```

## API Endpoints
- `POST /api/tutor`
- `POST /api/interest`
- `GET /api/health`

## Deploy Fast (Docker)
```powershell
docker build -t lumimath .
docker run -p 3000:3000 -e OPENAI_API_KEY=your_key_here -e OPENAI_MODEL=gpt-5.4 lumimath
```

## Limits and Config
Set in env:
- `TUTOR_RATE_LIMIT` default `35` requests/min per IP
- `INTEREST_RATE_LIMIT` default `20` requests/min per IP
- `MAX_BODY_BYTES` default `10000000`

## Important
- Progress uses browser localStorage.
- Parent contacts are saved in `data/interest-list.json` (single-server persistence).
- For multi-server scale, migrate contacts/progress to a real database.
