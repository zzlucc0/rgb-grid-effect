# RGB Grid Effect MVP (YouTube -> Chart)

## Run API

```bash
cd /mnt/data/projects/rgb-grid-effect
docker compose up -d --build
```

Health check:

```bash
curl http://localhost:8787/health
```

## Notes
- Supports public YouTube URLs only
- Max duration: 6 minutes
- Caches by video id under `server/data/cache`
