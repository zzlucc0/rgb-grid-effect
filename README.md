# Zpulse

Zpulse is a browser-based rhythm stage game with a neon arcade interface and chart-driven gameplay.

## What it does
- Loads a supported media URL
- Analyzes the track into a playable chart
- Runs the game in-browser with score, combo, judgement, and replay loop

## Run locally

```bash
cd /mnt/data/projects/rgb-grid-effect
docker compose up -d --build
```

Health check:

```bash
curl http://localhost:8787/health
```

## Current branding scope
This project currently uses **Zpulse** as the user-facing product name in the live UI.
Internal identifiers such as repository name, service name, schema names, and container names may still use legacy `rgb-grid-*` naming for compatibility.

## Notes
- Supports public YouTube URLs
- Max duration: 6 minutes
- Caches by video id under `server/data/cache`
