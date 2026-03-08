FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates && rm -rf /var/lib/apt/lists/*
RUN pip3 install --break-system-packages --no-cache-dir -U yt-dlp numpy librosa soundfile scipy
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /app/data/jobs /app/data/cache
EXPOSE 8787
CMD ["npm", "start"]
