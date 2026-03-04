import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const JOBS_DIR = path.join(ROOT, "data", "jobs");
const CACHE_DIR = path.join(ROOT, "data", "cache");

fs.mkdirSync(JOBS_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/media", express.static(CACHE_DIR));

const jobs = new Map();

function saveJob(job) {
  job.updatedAt = new Date().toISOString();
  jobs.set(job.id, job);
  fs.writeFileSync(path.join(JOBS_DIR, `${job.id}.json`), JSON.stringify(job, null, 2));
}

function loadJob(id) {
  if (jobs.has(id)) return jobs.get(id);
  const p = path.join(JOBS_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  jobs.set(id, j);
  return j;
}

function extractVideoId(input) {
  try {
    const u = new URL(input);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    return null;
  } catch {
    return null;
  }
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => (stdout += d.toString()));
    child.stderr.on("data", d => (stderr += d.toString()));
    child.on("close", code => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${cmd} failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function getMetadata(url) {
  const { stdout } = await run("yt-dlp", ["-J", "--no-playlist", url], ROOT);
  const data = JSON.parse(stdout);
  return {
    id: data.id,
    title: data.title,
    duration: Number(data.duration || 0),
    isPrivate: data.availability === "private"
  };
}

async function downloadAndConvert(url, videoId, job) {
  const dir = path.join(CACHE_DIR, videoId);
  fs.mkdirSync(dir, { recursive: true });

  const sourcePath = path.join(dir, "source.%(ext)s");
  const wavPath = path.join(dir, "audio.wav");

  job.status = "processing";
  job.step = "downloading audio";
  saveJob(job);

  await run("yt-dlp", ["--no-playlist", "-f", "bestaudio", "-o", sourcePath, url], dir);

  const downloaded = fs.readdirSync(dir).find(f => f.startsWith("source."));
  if (!downloaded) throw new Error("audio download failed");
  const downloadedPath = path.join(dir, downloaded);

  job.step = "converting audio";
  saveJob(job);

  await run("ffmpeg", ["-y", "-i", downloadedPath, "-ac", "1", "-ar", "44100", "-t", "360", wavPath], dir);

  return { dir, wavPath };
}

function buildSimpleChart(durationSec) {
  const notes = [];
  let t = 2;
  let i = 0;
  while (t < Math.min(durationSec - 1, 355)) {
    notes.push({
      time: Number(t.toFixed(3)),
      type: i % 5 === 0 ? "drag" : "tap",
      laneHint: i % 4
    });
    t += i % 4 === 0 ? 0.55 : 0.42;
    i += 1;
  }

  return {
    version: 1,
    difficulty: "normal",
    approachRateMs: 1250,
    notes
  };
}

async function processJob(job) {
  try {
    const videoId = extractVideoId(job.url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const cacheDir = path.join(CACHE_DIR, videoId);
    const chartFile = path.join(cacheDir, "chart.json");
    const wavFile = path.join(cacheDir, "audio.wav");

    if (fs.existsSync(chartFile) && fs.existsSync(wavFile)) {
      job.status = "done";
      job.step = "cache hit";
      job.result = {
        videoId,
        chart: JSON.parse(fs.readFileSync(chartFile, "utf8")),
        audioUrl: `/media/${videoId}/audio.wav`
      };
      return saveJob(job);
    }

    job.step = "fetch metadata";
    saveJob(job);

    const meta = await getMetadata(job.url);
    if (meta.isPrivate) throw new Error("Video is private");
    if (!meta.duration || meta.duration > 360) throw new Error("Video must be <= 6 minutes");

    await downloadAndConvert(job.url, videoId, job);

    job.step = "generate chart";
    saveJob(job);

    const chart = buildSimpleChart(meta.duration);
    fs.writeFileSync(chartFile, JSON.stringify(chart, null, 2));

    job.status = "done";
    job.step = "completed";
    job.result = {
      videoId,
      title: meta.title,
      duration: meta.duration,
      chart,
      audioUrl: `/media/${videoId}/audio.wav`
    };
    saveJob(job);
  } catch (err) {
    job.status = "failed";
    job.error = err.message;
    saveJob(job);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "rgb-grid-effect-server" });
});

app.post("/api/analyze-youtube", (req, res) => {
  const { url } = req.body ?? {};
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url is required" });
  if (!extractVideoId(url)) return res.status(400).json({ error: "Only YouTube links are supported" });

  const id = nanoid(10);
  const now = new Date().toISOString();
  const job = {
    id,
    status: "pending",
    step: "queued",
    url,
    createdAt: now,
    updatedAt: now,
    error: null,
    result: null
  };

  saveJob(job);
  processJob(job);
  res.status(202).json({ jobId: id, status: job.status });
});

app.get("/api/job/:id", (req, res) => {
  const job = loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

app.get("/api/chart/:id", (req, res) => {
  const job = loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: "job not found" });
  if (job.status !== "done" || !job.result?.chart) return res.status(409).json({ error: "chart not ready" });
  res.json(job.result);
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`Server listening on :${port}`);
});
