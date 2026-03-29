# Launch Plan (CEO + Autoplan Style)

This is the exact sequence to make tuterio usable for real users.

## What I completed for you
- Production app server hardening
- GPT-5.4 model wiring with fallback
- Photo upload + Python upscale pipeline
- Rate limiting + security headers
- Health endpoint + smoke test script
- Dockerfile + env template

## What only you need to do
1. Create an OpenAI API key.
2. Choose a hosting provider (Render, Railway, Fly.io, or VPS).
3. Set environment variables in host dashboard.
4. Add your public domain (optional now, recommended later).

## Exact deployment steps
1. Push `study-app` to a GitHub repository.
2. Connect repo to your host and deploy from root `study-app/`.
3. Set env vars:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL=gpt-5.4`
   - `NODE_ENV=production`
4. Verify deploy by opening `/api/health`.
5. Run smoke test against production URL:
   - `SMOKE_BASE_URL=https://your-domain node scripts/smoke_test.js`
6. Share app link with first 20 test users.

## Gate checks before opening to many users
- Health endpoint uptime stable for 24h
- No repeated 500 errors in logs
- Tutor response latency under 8 seconds on average
- Rate limit not too strict for real usage

## First scaling improvements (next sprint)
- Move parent contacts + progress to Postgres
- Add queued image processing worker
- Add CDN for static assets
- Add metrics dashboard (latency, error rate, token cost)
- Add account auth and per-user history
