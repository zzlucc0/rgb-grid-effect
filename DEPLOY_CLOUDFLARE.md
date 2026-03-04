# Deploy (Server + Cloudflare) — RGB Grid Effect MVP

## 1) Start services

```bash
cd /mnt/data/projects/rgb-grid-effect
docker compose up -d --build
```

- Web: `:8088`
- API: `:8787`

## 2) Verify locally

```bash
curl http://localhost:8088 | head
curl http://localhost:8787/health
curl http://localhost:8787/api/debug/version
```

## 3) Cloudflare setup (recommended)

Create DNS records to your server IP:

- `game.yourdomain.com` -> server IP
- `game-api.yourdomain.com` -> server IP

Use proxied mode (orange cloud).

## 4) Reverse proxy (Nginx/Caddy) on server

Map:

- `game.yourdomain.com` -> `http://127.0.0.1:8088`
- `game-api.yourdomain.com` -> `http://127.0.0.1:8787`

Then set in front-end:

```html
<script>
  window.RGB_API_BASE = "https://game-api.yourdomain.com";
</script>
```

(Place before `youtube-client.js`)

## 5) Runtime checks

- Submit a short public YouTube URL (<=6 min)
- Wait for status `done`
- Start game successfully

## 6) Common issues

- `Failed to fetch YouTube media`:
  - try another public video
  - check `docker logs rgb-grid-api`
- `Game engine init timeout`:
  - refresh page and retry
- No audio:
  - check `/media/<videoId>/audio.wav` exists

## 7) Update flow

```bash
cd /mnt/data/projects/rgb-grid-effect
git pull
docker compose up -d --build
```
