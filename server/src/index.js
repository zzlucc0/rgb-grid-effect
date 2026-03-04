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
const API_VERSION = "mvp-0.2.0";

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

function sanitizeError(err) {
  const m = String(err?.message || err || "Unknown error");
  if (/private/i.test(m)) return "Video is private or unavailable.";
  if (/<= 6 minutes|must be <= 6 minutes/i.test(m)) return "Video must be 6 minutes or shorter.";
  if (/yt-dlp failed/i.test(m)) return "Failed to fetch YouTube media. Try another public video.";
  return m;
}

function run(cmd, args, cwd, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = "";
    let stderr = "";
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill("SIGKILL");
      reject(new Error(`${cmd} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.on("data", d => (stdout += d.toString()));
    child.stderr.on("data", d => (stderr += d.toString()));
    child.on("close", code => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${cmd} failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function runWithRetry(cmd, args, cwd, retries = 1, timeoutMs = 120000) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      return await run(cmd, args, cwd, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastErr;
}

async function getMetadata(url) {
  const { stdout } = await runWithRetry(
    "yt-dlp",
    ["-J", "--no-playlist", "--extractor-args", "youtube:player_client=web", url],
    ROOT,
    1,
    90000
  );
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

  await runWithRetry(
    "yt-dlp",
    ["--no-playlist", "--extractor-args", "youtube:player_client=web", "-f", "bestaudio", "-o", sourcePath, url],
    dir,
    1,
    180000
  );

  const downloaded = fs.readdirSync(dir).find(f => f.startsWith("source."));
  if (!downloaded) throw new Error("audio download failed");
  const downloadedPath = path.join(dir, downloaded);

  job.step = "converting audio";
  saveJob(job);

  await run("ffmpeg", ["-y", "-i", downloadedPath, "-ac", "1", "-ar", "44100", "-t", "360", wavPath], dir, 120000);

  return { dir, wavPath };
}

function readWav16Mono(wavPath) {
  const buf = fs.readFileSync(wavPath);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Unsupported WAV format");
  }

  let offset = 12;
  let sampleRate = 44100;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      const audioFormat = buf.readUInt16LE(offset + 8);
      const channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      const bitsPerSample = buf.readUInt16LE(offset + 22);
      if (audioFormat !== 1 || channels !== 1 || bitsPerSample !== 16) {
        throw new Error("Expected PCM 16-bit mono WAV");
      }
    }
    if (id === "data") {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (dataOffset < 0) throw new Error("WAV data chunk not found");

  const count = Math.floor(dataSize / 2);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const s = buf.readInt16LE(dataOffset + i * 2);
    samples[i] = s / 32768;
  }

  return { sampleRate, samples };
}

function buildDspChartFromWav(wavPath) {
  const { sampleRate, samples } = readWav16Mono(wavPath);
  const windowSec = 0.05;
  const hop = Math.max(1, Math.floor(sampleRate * windowSec));

  const energies = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let sum = 0;
    for (let j = 0; j < hop; j++) {
      const v = samples[i + j];
      sum += v * v;
    }
    energies.push(Math.sqrt(sum / hop));
  }

  const flux = new Array(energies.length).fill(0);
  for (let i = 1; i < energies.length; i++) {
    flux[i] = Math.max(0, energies[i] - energies[i - 1]);
  }

  const notes = [];
  const minGapSec = 0.32;
  let lastNoteT = -99;

  for (let i = 8; i < flux.length - 1; i++) {
    let localSum = 0;
    for (let k = i - 8; k < i; k++) localSum += flux[k];
    const localAvg = localSum / 8;
    const t = i * windowSec;
    const isPeak = flux[i] > flux[i - 1] && flux[i] >= flux[i + 1];
    const strong = flux[i] > localAvg * 2.2 && flux[i] > 0.005;

    if (isPeak && strong && t - lastNoteT >= minGapSec && t >= 1.4) {
      const type = notes.length % 6 === 0 ? "drag" : "tap";
      notes.push({
        time: Number(t.toFixed(3)),
        type,
        laneHint: notes.length % 4,
        strength: Number(Math.min(1, flux[i] / (localAvg * 3 + 1e-6)).toFixed(2))
      });
      lastNoteT = t;
    }
  }

  if (notes.length < 20) {
    let t = 2;
    while (t < Math.min(samples.length / sampleRate - 1, 355)) {
      notes.push({ time: Number(t.toFixed(3)), type: notes.length % 5 === 0 ? "drag" : "tap", laneHint: notes.length % 4, strength: 0.5 });
      t += 0.42;
    }
  }

  return {
    version: 2,
    algorithm: "dsp-energy-flux",
    difficulty: "normal",
    approachRateMs: 1250,
    notes
  };
}

async function processJob(job) {
  const jobStart = Date.now();
  const MAX_JOB_MS = 5 * 60 * 1000;

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

    if (Date.now() - jobStart > MAX_JOB_MS) throw new Error("job timeout");

    const { wavPath } = await downloadAndConvert(job.url, videoId, job);

    if (Date.now() - jobStart > MAX_JOB_MS) throw new Error("job timeout");

    job.step = "generate chart (dsp)";
    saveJob(job);

    const chart = buildDspChartFromWav(wavPath);
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
    job.error = sanitizeError(err);
    saveJob(job);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "rgb-grid-effect-server", version: API_VERSION });
});

app.get("/api/debug/version", (_req, res) => {
  res.json({ version: API_VERSION, ytDlp: "container", now: new Date().toISOString() });
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
