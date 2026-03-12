# Cobalt Deploy (Render.com)

Deploy cobalt.tools on Render.com Free Tier for orbitrack URL Audio Import.

## Setup

1. Create a new **Git repo** with these files (Dockerfile, render.yaml)
2. Push to GitHub
3. Go to [render.com](https://render.com) → New → Web Service
4. Connect your GitHub repo
5. Render detects the Dockerfile automatically
6. **Important:** Set the port to `10000` (Render's default)
7. Deploy

## After Deploy

1. Copy your Render URL (e.g. `https://cobalt-xxxx.onrender.com`)
2. Update `API_URL` in render.yaml environment variables to match
3. In orbitrack: Settings → Audio → URL Audio Import → paste your Render URL

## Notes

- Free tier sleeps after 15 min inactivity (~30-50s cold start)
- The "Extracting audio..." message in orbitrack covers the wake-up time
- No credit card required for Render free tier
- CORS is enabled via `API_CORS_WILDCARD=1`
