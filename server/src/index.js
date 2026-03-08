import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import { spawn } from "child_process";
import { createHash } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const JOBS_DIR = path.join(ROOT, "data", "jobs");
const CACHE_DIR = path.join(ROOT, "data", "cache");
const API_VERSION = "mvp-0.6.0";
const CHART_SCHEMA_VERSION = 4;
const HLS_ENABLED = String(process.env.HLS_ENABLED || "true").toLowerCase() !== "false";
const YTDLP_COOKIES_PATH = process.env.YTDLP_COOKIES_PATH || "";
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
const CACHE_TTL_HOURS = Math.max(1, Number(process.env.CACHE_TTL_HOURS || 168));
const CACHE_CLEANUP_INTERVAL_MIN = Math.max(5, Number(process.env.CACHE_CLEANUP_INTERVAL_MIN || 60));

fs.mkdirSync(JOBS_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

const app = express();
app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("CORS origin not allowed"));
  }
}));
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
  } catch { return null; }
}
function isYouTubeUrl(url) {
  try { const h = new URL(url).hostname; return h.includes("youtube.com") || h === "youtu.be"; } catch { return false; }
}
function looksLikeDirectMedia(url) { return /\.(mp3|wav|m4a|ogg|webm|mp4)(\?|$)/i.test(url); }
function isBilibiliUrl(url) { try { return new URL(url).hostname.includes("bilibili.com"); } catch { return false; } }
function makeSourceId(url) {
  if (isYouTubeUrl(url)) return extractVideoId(url) || "yt_unknown";
  return "u_" + createHash("sha256").update(url).digest("hex").slice(0, 24);
}
function ytDlpArgs(extra) {
  const args = [];
  if (YTDLP_COOKIES_PATH) args.push("--cookies", YTDLP_COOKIES_PATH);
  return args.concat(extra);
}

async function ytProbe(url) {
  const { stdout } = await run("yt-dlp", ytDlpArgs(["--skip-download", "--dump-single-json", "--no-playlist", url]), ROOT, 45000);
  const j = JSON.parse(stdout || "{}");
  return {
    title: j?.title || "",
    duration: Number(j?.duration || 0),
    extractor: j?.extractor_key || j?.extractor || "unknown",
    webpageUrl: j?.webpage_url || url
  };
}

async function ytResolveAudioUrl(url) {
  const strategies = [
    ["-f", "bestaudio/best"],
    ["-f", "ba"],
    []
  ];
  let lastErr;
  for (const s of strategies) {
    try {
      const args = ["--no-playlist", "-g", ...s, url];
      const { stdout } = await run("yt-dlp", ytDlpArgs(args), ROOT, 60000);
      const u = String(stdout || "").trim().split("\n").find(Boolean);
      if (u) return u;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("resolve stream url failed");
}
function sanitizeError(err) {
  const m = String(err?.message || err || "Unknown error");
  if (/private|unavailable/i.test(m)) return "Video is private or unavailable.";
  if (/<= 6 minutes|must be <= 6 minutes/i.test(m)) return "Video must be 6 minutes or shorter.";
  if (/drm protected/i.test(m)) return "Video source is DRM-protected and cannot be fetched.";
  if (/timed out|timeout/i.test(m)) return "Processing timed out. Try a shorter/lighter video.";
  if (/yt-dlp failed|http error|requested format|precondition check failed/i.test(m)) return "Failed to fetch media from source.";
  return m;
}
function classifyError(err) {
  const m = String(err?.message || err || "").toLowerCase();
  if (m.includes("drm")) return "E_DRM";
  if (m.includes("private") || m.includes("unavailable")) return "E_UNAVAILABLE";
  if (m.includes("timed out") || m.includes("timeout")) return "E_TIMEOUT";
  if (m.includes("precondition check failed") || m.includes("http error 400")) return "E_YT_400";
  if (m.includes("requested format is not available")) return "E_FORMAT_UNAVAILABLE";
  return "E_FETCH";
}
function normalizeTitle(s = "") {
  return String(s).toLowerCase().replace(/\[[^\]]*\]|\([^\)]*\)/g, " ").replace(/official|mv|lyrics|audio|4k|hd|live|remix|version/g, " ").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
}
function buildSearchQueries(meta) {
  const title = String(meta?.title || "").trim();
  const uploader = String(meta?.uploader || "").trim();
  const clean = title.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/official|video|remaster|lyrics|4k|hd|mv/ig, " ").replace(/\s+/g, " ").trim();
  const short = clean.split(" ").slice(0, 6).join(" ");
  const byDash = clean.includes("-") ? clean.split("-").slice(0, 2).join(" ").trim() : "";
  const q = [clean, short, byDash, `${uploader} ${short}`.trim()].filter(Boolean);
  return [...new Set(q)];
}

function scoreCandidate(queryMeta, c) {
  const qTitle = normalizeTitle(queryMeta?.title || "");
  const cTitle = normalizeTitle(c?.title || "");
  const qWords = new Set(qTitle.split(" ").filter(Boolean));
  const cWords = new Set(cTitle.split(" ").filter(Boolean));
  let overlap = 0;
  for (const w of qWords) if (cWords.has(w)) overlap++;
  const titleSim = qWords.size ? overlap / qWords.size : 0;
  const qDur = Number(queryMeta?.duration || 0);
  const cDur = Number(c?.duration || 0);
  const durDelta = qDur && cDur ? Math.abs(qDur - cDur) : 999;
  const durationScore = durDelta <= 3 ? 1 : durDelta <= 8 ? 0.75 : durDelta <= 15 ? 0.45 : 0.1;
  const uploaderTrust = /official|topic|vevo|records|music/i.test(String(c?.uploader || "")) ? 1 : 0.4;
  return Number((0.5 * titleSim + 0.3 * durationScore + 0.2 * uploaderTrust).toFixed(4));
}

function run(cmd, args, cwd, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = "", stderr = "", done = false;
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
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await run(cmd, args, cwd, timeoutMs); }
    catch (e) { lastErr = e; if (i < retries) await new Promise(r => setTimeout(r, 900)); }
  }
  throw lastErr;
}

function simpleChart(durationSec, algo = "fallback") {
  const notes = []; let t = 1.6;
  while (t < Math.min(durationSec - 1, 355)) {
    notes.push({ time: Number(t.toFixed(3)), type: notes.length % 6 === 0 ? "drag" : "tap", laneHint: notes.length % 4, strength: 0.5 });
    t += 0.42;
  }
  return { version: CHART_SCHEMA_VERSION, algorithm: algo, difficulty: "normal", approachRateMs: 1250, notes };
}
function readWav16Mono(wavPath) {
  const buf = fs.readFileSync(wavPath);
  let off = 12, sr = 44100, dataOffset = -1, dataSize = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") sr = buf.readUInt32LE(off + 12);
    if (id === "data") { dataOffset = off + 8; dataSize = size; break; }
    off += 8 + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error("WAV data chunk not found");
  const count = Math.floor(dataSize / 2), samples = new Float32Array(count);
  for (let i = 0; i < count; i++) samples[i] = buf.readInt16LE(dataOffset + i * 2) / 32768;
  return { sampleRate: sr, samples };
}
function dspChartFromWav(wavPath) {
  const { sampleRate, samples } = readWav16Mono(wavPath);
  const hopSec = 0.05, hop = Math.max(1, Math.floor(sampleRate * hopSec));
  const energies = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let sum = 0; for (let j = 0; j < hop; j++) sum += samples[i + j] * samples[i + j];
    energies.push(Math.sqrt(sum / hop));
  }
  const flux = energies.map((v, i) => (i ? Math.max(0, v - energies[i - 1]) : 0));
  const notes = []; let last = -99;
  for (let i = 10; i < flux.length - 1; i++) {
    const local = flux.slice(i - 10, i).reduce((a, b) => a + b, 0) / 10;
    const t = i * hopSec;
    if (flux[i] > local * 2 && flux[i] > flux[i - 1] && flux[i] >= flux[i + 1] && t - last >= 0.3 && t >= 1.2) {
      notes.push({ time: Number(t.toFixed(3)), type: notes.length % 7 === 0 ? "drag" : "tap", laneHint: notes.length % 4, strength: 0.7 });
      last = t;
    }
  }
  if (notes.length < 20) return simpleChart(samples.length / sampleRate, "dsp-fallback");
  return { version: CHART_SCHEMA_VERSION, algorithm: "dsp-energy-flux-v2", difficulty: "normal", approachRateMs: 1250, notes };
}

async function tryDownloadToWav(url, workDir) {
  const sourceTpl = path.join(workDir, "source.%(ext)s");
  const wavPath = path.join(workDir, "audio.wav");
  if (isYouTubeUrl(url)) {
    const strategies = [
      ["youtube:player_client=web", "bestaudio"],
      ["youtube:player_client=tv", "bestaudio"],
      ["youtube:player_client=android", "bestaudio"],
      ["youtube:player_client=tv,web", "ba/bestaudio"]
    ];
    let lastErr;
    for (const [clientArg, fmt] of strategies) {
      try {
        await runWithRetry("yt-dlp", ytDlpArgs(["--no-playlist", "--extractor-args", clientArg, "-f", fmt, "-o", sourceTpl, url]), workDir, 0, 180000);
        lastErr = null; break;
      } catch (e) { lastErr = e; }
    }
    if (lastErr) throw lastErr;
  } else {
    await runWithRetry("yt-dlp", ytDlpArgs(["-o", sourceTpl, url]), workDir, 0, 180000);
  }
  const downloaded = fs.readdirSync(workDir).find(f => f.startsWith("source."));
  if (!downloaded) throw new Error("media download failed");
  await run("ffmpeg", ["-y", "-i", path.join(workDir, downloaded), "-ac", "1", "-ar", "44100", "-t", "360", wavPath], workDir, 120000);
  return wavPath;
}

async function fetchYouTubeMeta(url) {
  try {
    const { stdout } = await run("yt-dlp", ytDlpArgs(["--skip-download", "--dump-single-json", "--no-playlist", url]), ROOT, 45000);
    const meta = JSON.parse(stdout || "{}");
    return {
      title: meta?.title || "",
      duration: Number(meta?.duration || 0),
      uploader: meta?.uploader || "",
      id: meta?.id || extractVideoId(url) || ""
    };
  } catch {}

  try {
    const u = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (r.ok) {
      const j = await r.json();
      return {
        title: j?.title || "",
        duration: 0,
        uploader: j?.author_name || "",
        id: extractVideoId(url) || ""
      };
    }
  } catch {}

  return { title: "", duration: 0, uploader: "", id: extractVideoId(url) || "" };
}

async function tryMirrorDownloadToWav(job, sourceId, cacheDir) {
  if (!isYouTubeUrl(job.url)) return null;
  const meta = await fetchYouTubeMeta(job.url);
  const queries = buildSearchQueries(meta);
  if (queries.length === 0) return null;

  const providers = [
    { name: "bilibili", search: searchBilibili },
    { name: "soundcloud", search: searchSoundCloud },
    { name: "archive", search: searchArchive }
  ];

  job.step = "mirror search";
  saveJob(job);

  for (const provider of providers) {
    let candidates = [];
    let queryUsed = "";
    for (const q of queries.slice(0, 3)) {
      const found = await provider.search(q, 8);
      if (found.length) {
        candidates = found;
        queryUsed = q;
        break;
      }
    }

    const ranked = candidates
      .map(c => ({ ...c, url: String(c.url || "").replace(/^http:\/\//, "https://"), score: scoreCandidate(meta, c) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    for (const c of ranked) {
      if (c.score < 0.48) continue;
      try {
        job.step = `mirror fetch (${provider.name}:${c.id || "candidate"})`;
        saveJob(job);
        const wav = await tryDownloadToWav(c.url, cacheDir);
        return { wav, mirror: { provider: provider.name, query: queryUsed, picked: c, meta } };
      } catch (err) {
        job.attempts.push({ provider: `${provider.name}-mirror`, ok: false, code: classifyError(err), error: sanitizeError(err), picked: c.url, score: c.score, at: new Date().toISOString() });
      }
    }
  }

  return null;
}

function cleanupCache(maxAgeHours = CACHE_TTL_HOURS) {
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 3600 * 1000;
  let removed = 0;
  for (const entry of fs.readdirSync(CACHE_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = path.join(CACHE_DIR, entry.name);
    try {
      const st = fs.statSync(p);
      if (now - st.mtimeMs > maxAgeMs) {
        fs.rmSync(p, { recursive: true, force: true });
        removed++;
      }
    } catch {}
  }
  return removed;
}

async function buildHlsFromWav(wavPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const playlist = path.join(outDir, "index.m3u8");
  await run("ffmpeg", [
    "-y", "-i", wavPath,
    "-c:a", "aac", "-b:a", "128k",
    "-f", "hls",
    "-hls_time", "4",
    "-hls_playlist_type", "vod",
    "-hls_segment_filename", path.join(outDir, "seg_%03d.ts"),
    playlist
  ], ROOT, 120000);
  return playlist;
}

async function captureAudioToWav(url, wavPath, workDir, captureSec = 45) {
  const sec = Math.max(8, Math.min(180, Number(captureSec || 45)));
  if (isYouTubeUrl(url)) {
    const streamUrl = await ytResolveAudioUrl(url);
    await run("ffmpeg", ["-y", "-t", String(sec), "-i", streamUrl, "-vn", "-ac", "1", "-ar", "44100", wavPath], workDir, 180000);
    return { captureSec: sec, method: "youtube-stream" };
  }

  const downloadedWav = await tryDownloadToWav(url, workDir);
  await run("ffmpeg", ["-y", "-t", String(sec), "-i", downloadedWav, "-ac", "1", "-ar", "44100", wavPath], workDir, 120000);
  return { captureSec: sec, method: "download-transcode" };
}

async function processCaptureJob(job) {
  const sourceId = makeSourceId(job.url) + "_cap";
  const cacheDir = path.join(CACHE_DIR, sourceId);
  const wavPath = path.join(cacheDir, "capture.wav");
  const chartFile = path.join(cacheDir, "chart.json");
  fs.mkdirSync(cacheDir, { recursive: true });

  job.status = "processing";
  job.step = "probe page";
  saveJob(job);

  let meta = { title: "", duration: 0, extractor: "generic", webpageUrl: job.url };
  if (isYouTubeUrl(job.url)) {
    try { meta = await ytProbe(job.url); } catch {}
  }
  job.captureMeta = meta;
  saveJob(job);

  job.step = "capture audio";
  saveJob(job);
  const cap = await captureAudioToWav(job.url, wavPath, cacheDir, job.captureSec || 45);

  job.step = "analyze rhythm";
  saveJob(job);
  const chart = dspChartFromWav(wavPath);
  fs.writeFileSync(chartFile, JSON.stringify(chart, null, 2));

  if (HLS_ENABLED) {
    job.step = "building hls";
    saveJob(job);
    try { await buildHlsFromWav(wavPath, path.join(cacheDir, "hls")); } catch {}
  }

  const hlsUrl = fs.existsSync(path.join(cacheDir, "hls", "index.m3u8")) ? `/media/${sourceId}/hls/index.m3u8` : null;
  job.status = "done";
  job.step = "completed";
  job.result = {
    mode: "capture-poc",
    sourceId,
    chart,
    audioUrl: `/media/${sourceId}/capture.wav`,
    hlsUrl,
    captureSec: cap.captureSec,
    extractor: meta.extractor,
    method: cap.method
  };
  saveJob(job);
}

async function processOfflineJob(job) {
  const sourceId = makeSourceId(job.url);
  const cacheDir = path.join(CACHE_DIR, sourceId);
  const chartFile = path.join(cacheDir, "chart.json");
  const wavFile = path.join(cacheDir, "audio.wav");
  fs.mkdirSync(cacheDir, { recursive: true });

  if (fs.existsSync(chartFile) && fs.existsSync(wavFile)) {
    try {
      const chart = JSON.parse(fs.readFileSync(chartFile, "utf8"));
      if (chart?.version >= CHART_SCHEMA_VERSION && chart?.notes?.length) {
        job.status = "done";
        job.step = "cache hit";
        const hlsUrl = fs.existsSync(path.join(cacheDir, "hls", "index.m3u8")) ? `/media/${sourceId}/hls/index.m3u8` : null;
        job.result = { mode: "offline", sourceId, chart, audioUrl: `/media/${sourceId}/audio.wav`, hlsUrl };
        return saveJob(job);
      }
    } catch {}
  }

  job.status = "processing";
  job.step = "downloading media";
  job.attempts = [];
  saveJob(job);

  let wav;
  try {
    wav = await tryDownloadToWav(job.url, cacheDir);
    job.attempts.push({ provider: "youtube-direct", ok: true, at: new Date().toISOString() });
  } catch (err) {
    job.attempts.push({ provider: "youtube-direct", ok: false, code: classifyError(err), error: sanitizeError(err), at: new Date().toISOString() });
    const mirrorResult = await tryMirrorDownloadToWav(job, sourceId, cacheDir);
    if (!mirrorResult?.wav) throw err;
    wav = mirrorResult.wav;
    job.attempts.push({ provider: mirrorResult.mirror.provider, ok: true, score: mirrorResult.mirror?.picked?.score || 0, picked: mirrorResult.mirror?.picked?.url || "", at: new Date().toISOString() });
    job.mirror = mirrorResult.mirror;
  }

  if (HLS_ENABLED) {
    job.step = "building hls";
    saveJob(job);
    try { await buildHlsFromWav(wav, path.join(cacheDir, "hls")); } catch {}
  }

  job.step = "analyzing rhythm";
  saveJob(job);
  const chart = dspChartFromWav(wav);
  fs.writeFileSync(chartFile, JSON.stringify(chart, null, 2));

  job.status = "done";
  job.step = "completed";
  const hlsUrl = fs.existsSync(path.join(cacheDir, "hls", "index.m3u8")) ? `/media/${sourceId}/hls/index.m3u8` : null;
  job.result = { mode: "offline", sourceId, chart, audioUrl: `/media/${sourceId}/audio.wav`, hlsUrl };
  saveJob(job);
}

function buildOnlineFallback(url, reason) {
  return {
    mode: "online",
    player: isYouTubeUrl(url) ? { type: "youtube", videoId: extractVideoId(url) } : { type: "audio", url },
    chartSeed: { bpm: 122, density: 1.0, pattern: "adaptive" },
    reason: reason || "offline fetch failed"
  };
}

async function searchBilibili(query, limit = 5) {
  const q = String(query || "").trim();
  if (!q) return [];
  const n = Math.max(1, Math.min(10, Number(limit) || 5));

  // 1) Bilibili search endpoint that is reachable from this server
  try {
    const api = "https://s.search.bilibili.com/cate/search?main_ver=v3&search_type=video&view_type=hot_rank&order=click&copy_right=-1&cate_id=0&page=1&page_size=" + n + "&jsonp=jsonp&keyword=" + encodeURIComponent(q);
    const resp = await fetch(api, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/" }
    });
    if (resp.ok) {
      const data = await resp.json();
      const arr = Array.isArray(data?.result) ? data.result : [];
      const out = [];
      for (const e of arr) {
        const bvid = e?.bvid || "";
        const url = bvid ? ("https://www.bilibili.com/video/" + bvid) : (e?.arcurl || "");
        if (!url || url.indexOf("bilibili.com/video/") === -1) continue;
        const cleanTitle = String(e?.title || "Untitled").replace(/<[^>]+>/g, "");
        const durationText = String(e?.duration || "0:00");
        const parts = durationText.split(":").map(x => Number(x || 0));
        const dur = parts.length===2 ? parts[0]*60+parts[1] : (parts.length===3 ? parts[0]*3600 + parts[1]*60 + parts[2] : 0);
        out.push({
          title: cleanTitle,
          url,
          duration: dur,
          uploader: e?.author || "",
          id: bvid || e?.aid || ""
        });
        if (out.length >= n) break;
      }
      if (out.length) return out;
    }
  } catch {}

  // 2) fallback to yt-dlp bilisearch
  try {
    const searchExpr = `bilisearch${n}:${q}`;
    const { stdout } = await run("yt-dlp", ytDlpArgs(["--ignore-errors", "--no-warnings", "-J", searchExpr]), ROOT, 90000);
    const data = JSON.parse(stdout);
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    const out = [];
    for (const e of entries) {
      const id = e?.id || "";
      const url = e?.webpage_url || (id ? `https://www.bilibili.com/video/${id}` : "");
      if (!url || url.indexOf("bilibili.com/video/") === -1) continue;
      out.push({ title: e?.title || "Untitled", url, duration: Number(e?.duration || 0), uploader: e?.uploader || e?.channel || "", id });
      if (out.length >= n) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function searchSoundCloud(query, limit = 5) {
  const q = String(query || "").trim();
  if (!q) return [];
  const n = Math.max(1, Math.min(10, Number(limit) || 5));
  try {
    const searchExpr = `scsearch${n}:${q}`;
    const { stdout } = await run("yt-dlp", ytDlpArgs(["--ignore-errors", "--no-warnings", "-J", searchExpr]), ROOT, 90000);
    const data = JSON.parse(stdout || "{}");
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    const out = [];
    for (const e of entries) {
      const url = e?.webpage_url || "";
      if (!url || !url.includes("soundcloud.com")) continue;
      out.push({ title: e?.title || "Untitled", url, duration: Number(e?.duration || 0), uploader: e?.uploader || e?.channel || "", id: e?.id || "" });
      if (out.length >= n) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function searchArchive(query, limit = 5) {
  const q = String(query || "").trim();
  if (!q) return [];
  const n = Math.max(1, Math.min(10, Number(limit) || 5));
  try {
    const api = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier,title,creator&rows=${n}&page=1&output=json`;
    const resp = await fetch(api, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!resp.ok) return [];
    const data = await resp.json();
    const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    const out = [];
    for (const d of docs) {
      const id = String(d?.identifier || "");
      if (!id) continue;
      out.push({
        title: d?.title || id,
        url: `https://archive.org/details/${id}`,
        duration: 0,
        uploader: d?.creator || "",
        id
      });
      if (out.length >= n) break;
    }
    return out;
  } catch {
    return [];
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "rgb-grid-effect-server", version: API_VERSION, chartSchema: CHART_SCHEMA_VERSION });
});

app.get("/api/debug/version", async (_req, res) => {
  let ytDlpVersion = "unknown";
  try { ytDlpVersion = (await run("yt-dlp", ytDlpArgs(["--version"]), ROOT, 8000)).stdout.trim(); } catch {}
  res.json({ version: API_VERSION, chartSchema: CHART_SCHEMA_VERSION, ytDlpVersion, now: new Date().toISOString() });
});

app.post("/api/resolve-source", (req, res) => {
  const { url } = req.body ?? {};
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url is required" });
  const sourceType = isYouTubeUrl(url) ? "youtube" : (looksLikeDirectMedia(url) ? "direct-media" : (isBilibiliUrl(url) ? "bilibili" : "webpage"));
  const preferred = sourceType === "webpage" ? "online" : "offline";
  res.json({ sourceType, preferredMode: preferred, fallbackMode: "online" });
});

app.post("/api/search-bilibili", async (req, res) => {
  try {
    const { query, limit } = req.body ?? {};
    if (!query || typeof query !== "string") return res.status(400).json({ error: "query is required" });
    const results = await searchBilibili(query, Number(limit || 5));
    res.json({ query, count: results.length, results, empty: results.length===0 });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

app.post("/api/capture-link", async (req, res) => {
  const { url, captureSec } = req.body ?? {};
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url is required" });
  const id = nanoid(10);
  const now = new Date().toISOString();
  const job = { id, kind: "capture", status: "pending", step: "queued", url, captureSec: Number(captureSec || 45), createdAt: now, updatedAt: now, error: null, result: null };
  saveJob(job);
  res.status(202).json({ jobId: id, status: job.status, kind: "capture" });
  try {
    await processCaptureJob(job);
  } catch (err) {
    job.status = "failed";
    job.step = "capture failed";
    job.errorCode = classifyError(err);
    job.error = sanitizeError(err);
    saveJob(job);
  }
});

app.get("/api/capture-job/:id", (req, res) => {
  const job = loadJob(req.params.id);
  if (!job || job.kind !== "capture") return res.status(404).json({ error: "capture job not found" });
  res.json(job);
});

app.post("/api/analyze-link", async (req, res) => {
  const { url } = req.body ?? {};
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url is required" });
  const id = nanoid(10);
  const now = new Date().toISOString();
  const job = { id, status: "pending", step: "queued", url, createdAt: now, updatedAt: now, error: null, result: null };
  saveJob(job);
  res.status(202).json({ jobId: id, status: job.status });

  // New strategy: for YouTube, prefer official player mode directly (no audio file fetch/download pipeline)
  if (isYouTubeUrl(url)) {
    job.status = "done";
    job.step = "youtube official player";
    job.result = buildOnlineFallback(url, "official player mode");
    saveJob(job);
    return;
  }

  try {
    await processOfflineJob(job);
  } catch (err) {
    // fallback path: try capture-poc flow before dropping to online-only mode
    try {
      const capJob = {
        ...job,
        id: job.id,
        kind: "capture-fallback",
        captureSec: 45,
        attempts: Array.isArray(job.attempts) ? job.attempts : []
      };
      await processCaptureJob(capJob);
      capJob.result.mode = "offline-capture-fallback";
      capJob.error = null;
      capJob.errorCode = null;
      saveJob(capJob);
      return;
    } catch (capErr) {
      job.attempts = Array.isArray(job.attempts) ? job.attempts : [];
      job.attempts.push({ provider: "capture-fallback", ok: false, code: classifyError(capErr), error: sanitizeError(capErr), at: new Date().toISOString() });
    }

    job.status = "failed";
    job.step = "online fallback";
    job.errorCode = classifyError(err);
    job.error = sanitizeError(err);
    job.result = buildOnlineFallback(url, job.error);
    saveJob(job);
  }
});

app.get("/api/job/:id", (req, res) => {
  const job = loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

const port = Number(process.env.PORT || 8787);

if (YTDLP_COOKIES_PATH && fs.existsSync(YTDLP_COOKIES_PATH)) {
  try {
    const mode = fs.statSync(YTDLP_COOKIES_PATH).mode & 0o777;
    if (mode & 0o077) {
      console.warn(`[warn] Cookie file permissions are too open (${mode.toString(8)}). Recommend chmod 600 ${YTDLP_COOKIES_PATH}`);
    }
  } catch {}
}

setInterval(() => {
  try {
    const removed = cleanupCache(CACHE_TTL_HOURS);
    if (removed > 0) console.log(`[cache] removed ${removed} expired source dirs`);
  } catch (e) {
    console.warn(`[cache] cleanup failed: ${sanitizeError(e)}`);
  }
}, CACHE_CLEANUP_INTERVAL_MIN * 60 * 1000).unref();

app.listen(port, () => console.log(`Server listening on :${port}`));
