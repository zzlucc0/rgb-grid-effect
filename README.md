# Zpulse

Zpulse is a browser rhythm game that turns a YouTube link into something playable.

Paste a song, let it analyze the track, and it builds a chart you can actually play in the browser. The whole thing leans hard into neon arcade energy: big glow, sharp UI, score/combo feedback, and a slightly dramatic stage vibe.

## What it does

- takes a **YouTube URL**
- analyzes the song into a playable chart
- runs the chart in-browser with timing judgements, combo, score, and replay

## Run it locally

```bash
cd /mnt/data/projects/rgb-grid-effect
docker compose up -d --build
```

Health check:

```bash
curl http://localhost:8787/health
```

## Current setup

- **Frontend:** `http://localhost:8088` (or whatever host/port you mapped)
- **API:** `http://localhost:8787`
- **Main supported source:** public **YouTube** links

## Notes that are actually useful

- The UI is intentionally branded as **Zpulse**.
- Some internal names still say `rgb-grid-*` because renaming every container/script/path is annoying and not worth breaking things.
- Cached analysis lives under `server/data/cache`.
- If playback/analyze behavior changes and you want a clean retest, clear old cache for the target song first.

## Project vibe

This is not trying to be a sterile demo app.
It should feel like a playable arcade machine with attitude.

If you change the UI, keep that in mind.