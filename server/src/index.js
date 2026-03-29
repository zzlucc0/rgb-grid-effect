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
const API_VERSION = "mvp-1.0.0";
const CHART_SCHEMA_VERSION = 4;
const HLS_ENABLED = String(process.env.HLS_ENABLED || "true").toLowerCase() !== "false";
const YTDLP_COOKIES_PATH = process.env.YTDLP_COOKIES_PATH || "";
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
const CACHE_TTL_HOURS = Math.max(1, Number(process.env.CACHE_TTL_HOURS || 48));
const CACHE_CLEANUP_INTERVAL_MIN = Math.max(5, Number(process.env.CACHE_CLEANUP_INTERVAL_MIN || 60));
const LINK_PLAY_ONLY = String(process.env.LINK_PLAY_ONLY || "true").toLowerCase() !== "false";
const FULL_ANALYSIS_MAX_SEC = Math.max(30, Number(process.env.FULL_ANALYSIS_MAX_SEC || 240));
const SEGMENT_ANALYSIS_THRESHOLD_SEC = Math.max(60, Number(process.env.SEGMENT_ANALYSIS_THRESHOLD_SEC || 240));
const SEGMENT_WINDOW_SEC = Math.max(20, Number(process.env.SEGMENT_WINDOW_SEC || 60));
const SEGMENT_OVERLAP_SEC = Math.max(2, Number(process.env.SEGMENT_OVERLAP_SEC || 5));
const MAX_CAPTURE_SEC = Math.max(120, Number(process.env.MAX_CAPTURE_SEC || 1200));
const ANALYSIS_STRATEGY = String(process.env.ANALYSIS_STRATEGY || 'auto').toLowerCase();
const DEFAULT_CHART_DENSITY = String(process.env.DEFAULT_CHART_DENSITY || 'normal').toLowerCase();

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
const jobControllers = new Map();
const jobChildren = new Map();

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

function ensureJobController(jobId) {
  if (!jobControllers.has(jobId)) jobControllers.set(jobId, { cancelled: false });
  return jobControllers.get(jobId);
}
function isJobCancelled(jobId) {
  return Boolean(jobId && jobControllers.get(jobId)?.cancelled);
}
function throwIfCancelled(jobId) {
  if (isJobCancelled(jobId)) throw new Error('job cancelled');
}
function registerJobChild(jobId, child) {
  if (!jobId || !child) return;
  if (!jobChildren.has(jobId)) jobChildren.set(jobId, new Set());
  const set = jobChildren.get(jobId);
  set.add(child);
  const cleanup = () => set.delete(child);
  child.on('close', cleanup);
  child.on('exit', cleanup);
}
function killJobChildren(jobId) {
  const set = jobChildren.get(jobId);
  if (!set) return 0;
  let killed = 0;
  for (const child of set) {
    try { child.kill('SIGKILL'); killed += 1; } catch {}
  }
  jobChildren.delete(jobId);
  return killed;
}
function cancelJob(job) {
  if (!job) return { ok: false, error: 'job not found' };
  const ctl = ensureJobController(job.id);
  ctl.cancelled = true;
  const killed = killJobChildren(job.id);
  job.status = 'failed';
  job.step = 'cancelled';
  job.errorCode = 'E_CANCELLED';
  job.error = 'Analysis cancelled by user.';
  saveJob(job);
  return { ok: true, killed };
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
function isBilibiliUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.includes("bilibili.com") || h === "b23.tv" || h.endsWith(".b23.tv");
  } catch { return false; }
}
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
  const { stdout } = await run("yt-dlp", ytDlpArgs(["--skip-download", "--dump-single-json", "--no-playlist", url]), ROOT, 45000, null);
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
      const { stdout } = await run("yt-dlp", ytDlpArgs(args), ROOT, 60000, null);
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

function run(cmd, args, cwd, timeoutMs = 120000, jobId = null) {
  return new Promise((resolve, reject) => {
    if (jobId) throwIfCancelled(jobId);
    const child = spawn(cmd, args, { cwd });
    registerJobChild(jobId, child);
    let stdout = "", stderr = "", done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`${cmd} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on("data", d => (stdout += d.toString()));
    child.stderr.on("data", d => (stderr += d.toString()));
    child.on("close", code => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (jobId && isJobCancelled(jobId)) return reject(new Error('job cancelled'));
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${cmd} failed (${code}): ${stderr || stdout}`));
    });
  });
}
async function runWithRetry(cmd, args, cwd, retries = 1, timeoutMs = 120000, jobId = null) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await run(cmd, args, cwd, timeoutMs, jobId); }
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

function buildSegmentsFromChart(chart, durationSec) {
  const total = Math.max(12, Math.floor(durationSec || 45));
  const windowSec = 8;
  const segments = [];
  for (let start = 0; start < total; start += windowSec) {
    const end = Math.min(total, start + windowSec);
    const hits = (chart?.notes || []).filter(n => n.time >= start && n.time < end);
    const density = hits.length / Math.max(1, end - start);
    const energy = density > 2.3 ? 'high' : density > 1.2 ? 'mid' : 'low';
    const label = start < 8 ? 'intro' : (energy === 'high' ? 'chorus' : energy === 'mid' ? 'verse' : 'break');
    segments.push({ start, end, noteCount: hits.length, density: Number(density.toFixed(2)), energy, label });
  }
  return segments;
}

function estimateBpmFromChart(chart) {
  const times = (chart?.notes || []).map(n => Number(n.time || 0)).filter(Boolean);
  if (times.length < 4) return 122;
  const deltas = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 0.2 && d < 1.0) deltas.push(d);
  }
  if (!deltas.length) return 122;
  deltas.sort((a,b)=>a-b);
  const mid = deltas[Math.floor(deltas.length / 2)] || 0.49;
  const bpm = 60 / Math.max(0.25, mid * 2);
  return Math.max(72, Math.min(180, Number(bpm.toFixed(1))));
}

async function processOnlineAnalyzedJob(job) {
  const sourceId = makeSourceId(job.url) + '_analysis';
  const cacheDir = path.join(CACHE_DIR, sourceId);
  const wavPath = path.join(cacheDir, 'analysis.wav');
  const optionsKey = buildOptionsKey(job);
  const analysisFile = path.join(cacheDir, `analysis_${optionsKey}.json`);
  fs.mkdirSync(cacheDir, { recursive: true });

  job.status = 'processing';
  job.step = 'resolving stream';
  saveJob(job);

  let meta = { title: '', duration: 0, extractor: 'unknown', webpageUrl: job.url };
  if (isYouTubeUrl(job.url) || isBilibiliUrl(job.url)) {
    try { meta = await ytProbe(job.url); } catch {}
  }

  const fullDuration = Number(job.fullDuration || meta.duration || 0);
  const chartDensity = sanitizeDensity(job.chartDensity || DEFAULT_CHART_DENSITY);
  const mode = decideAnalysisMode(fullDuration, job.analysisStrategy || ANALYSIS_STRATEGY);
  job.captureMeta = meta;
  job.analysisMode = mode;
  job.chartDensity = chartDensity;
  job.optionsKey = optionsKey;
  const cachedWhole = readJsonIfExists(analysisFile);
  if (cachedWhole?.chart?.notes?.length && cachedWhole?.analysis) {
    job.status = 'done';
    job.step = 'analysis ready';
    job.result = { mode: 'online-analyzed', player: buildOnlinePlayerFromUrl(job.url), chart: cachedWhole.chart, analysis: cachedWhole.analysis, chartSeed: { bpm: Number(cachedWhole.analysis?.bpm || estimateBpmFromChart(cachedWhole.chart)), density: 1.0, pattern: 'analyzed' }, difficulty: job.difficulty || 'normal' };
    saveJob(job);
    return;
  }
  saveJob(job);

  let chart;
  let analysis;
  let captureSec = 0;
  let method = 'unknown';

  if (mode === 'segmented-full' && fullDuration > 0) {
    const windows = buildSegmentWindows(fullDuration, SEGMENT_WINDOW_SEC, SEGMENT_OVERLAP_SEC);
    const charts = [];
    const allSegments = [];
    const allBeats = [];
    const allDownbeats = [];
    for (let i = 0; i < windows.length; i++) {
      const win = windows[i];
      job.step = `analyzing segment ${i + 1}/${windows.length}`;
      job.segmentProgress = { index: i + 1, total: windows.length, start: win.start, end: win.end };
      saveJob(job);
      const part = await analyzeChartWindow(job.url, cacheDir, meta, job.difficulty || 'normal', chartDensity, optionsKey, win.start, win.end, job.id);
      charts.push(part.chart);
      allSegments.push(...(part.analysis?.segments || []));
      allBeats.push(...(part.analysis?.beats || []));
      allDownbeats.push(...(part.analysis?.downbeats || []));
      captureSec += Math.max(0, Number(win.end) - Number(win.start));
      method = part.analysis?.analyzer || method;
    }
    chart = mergeChartNotes(charts, job.difficulty || 'normal', fullDuration || captureSec, chartDensity);
    analysis = mergeAnalysisWithChart(chart, {
      ok: true,
      duration: fullDuration || captureSec,
      bpm: estimateBpmFromChart(chart),
      beats: allBeats.sort((a,b)=>a-b),
      downbeats: allDownbeats.sort((a,b)=>a-b),
      segments: allSegments.sort((a,b)=>Number(a.start||0)-Number(b.start||0)),
      analyzer: 'hybrid-segmented',
      segmented: true,
      windows
    });
  } else {
    const targetSec = Math.max(8, Math.min(MAX_CAPTURE_SEC, Number(job.captureSec || fullDuration || FULL_ANALYSIS_MAX_SEC || 45)));
    job.step = targetSec >= Math.max(60, fullDuration - 1) ? 'capturing full audio' : 'capturing preview audio';
    saveJob(job);
    const cap = await captureAudioToWav(job.url, wavPath, cacheDir, targetSec, job.id);
    captureSec = cap.captureSec;
    method = cap.method;

    job.step = 'analyzing rhythm';
    saveJob(job);
    try {
      analysis = await analyzeRhythmWithPython(wavPath, cacheDir, job.id);
      chart = chartFromAnalysis(analysis, job.difficulty || 'normal', chartDensity);
    } catch (_err) {
      chart = dspChartFromWav(wavPath);
      chart.difficulty = job.difficulty || 'normal';
      const durationSec = Number(fullDuration || targetSec || 45);
      analysis = {
        duration: durationSec,
        bpm: estimateBpmFromChart(chart),
        beats: (chart.notes || []).map(n => n.time),
        segments: buildSegmentsFromChart(chart, durationSec),
        analyzer: 'dsp-fallback'
      };
    }
  }

  analysis = mergeAnalysisWithChart(chart, {
    ...analysis,
    sourceId,
    captureSec,
    method,
    extractor: meta.extractor || 'unknown',
    title: meta.title || '',
    fullDuration: fullDuration || Number(analysis?.duration || 0),
    analysisMode: mode,
    chartDensity,
    optionsKey
  });
  const bpm = Number(analysis.bpm || estimateBpmFromChart(chart));
  fs.writeFileSync(analysisFile, JSON.stringify({ chart, analysis }, null, 2));

  job.status = 'done';
  job.step = 'analysis ready';
  if (isBilibiliUrl(job.url)) {
    const hlsDir = path.join(cacheDir, 'hls');
    let hlsUrl = null;
    try {
      if (HLS_ENABLED) {
        await buildHlsFromWav(wavPath, hlsDir);
        if (fs.existsSync(path.join(hlsDir, 'index.m3u8'))) hlsUrl = `/media/${sourceId}/hls/index.m3u8`;
      }
    } catch {}
    job.result = {
      mode: 'offline',
      sourceId,
      chart,
      analysis,
      audioUrl: `/media/${sourceId}/analysis.wav`,
      hlsUrl,
      chartSeed: { bpm, density: 1.0, pattern: 'analyzed' },
      difficulty: job.difficulty || 'normal'
    };
    saveJob(job);
    return;
  }

  tryDeleteFile(wavPath); // free disk: WAV no longer needed once chart is cached
  job.result = {
    mode: 'online-analyzed',
    player: buildOnlinePlayerFromUrl(job.url),
    chart,
    analysis,
    chartSeed: { bpm, density: 1.0, pattern: 'analyzed' },
    difficulty: job.difficulty || 'normal'
  };
  saveJob(job);
}



function tryDeleteFile(fp) {
  try { if (fp && fs.existsSync(fp)) fs.unlinkSync(fp); } catch (_) {}
}

async function analyzeRhythmWithPython(wavPath, cwd = ROOT, jobId = null) {
  const { stdout } = await run("python3", [path.join(ROOT, "scripts", "analyze_rhythm.py"), wavPath], cwd, 180000, jobId);
  const parsed = JSON.parse(String(stdout || "{}").trim() || "{}");
  parsed.analyzer = parsed.analyzer || 'librosa';
  if (!parsed.ok) throw new Error(parsed.error || "python analyzer failed");
  return parsed;
}


function getDifficultyConfig(name = 'normal') {
  const map = {
    easy: { weakChance: 0.35, dragBoost: -0.06, minGap: 0.34, maxNotesScale: 0.72 },
    normal: { weakChance: 0.62, dragBoost: 0, minGap: 0.24, maxNotesScale: 1.0 },
    hard: { weakChance: 0.88, dragBoost: 0.08, minGap: 0.18, maxNotesScale: 1.22 }
  };
  return map[name] || map.normal;
}

function getDensityConfig(name = 'normal') {
  const key = String(name || 'normal').toLowerCase();
  const map = {
    relaxed: { noteScale: 0.84, extraWeakScale: 0.82, dragBoost: -0.03, tailGapTarget: 2.4 },
    normal: { noteScale: 1.0, extraWeakScale: 1.0, dragBoost: 0, tailGapTarget: 3.2 },
    dense: { noteScale: 1.18, extraWeakScale: 1.15, dragBoost: 0.04, tailGapTarget: 4.0 }
  };
  return map[key] || map.normal;
}

function sanitizeStrategy(name = 'auto') {
  const v = String(name || 'auto').toLowerCase();
  return ['auto','full','segmented'].includes(v) ? v : 'auto';
}

function sanitizeDensity(name = 'normal') {
  const v = String(name || 'normal').toLowerCase();
  return ['relaxed','normal','dense'].includes(v) ? v : 'normal';
}

function buildOptionsKey(opts = {}) {
  const raw = JSON.stringify({
    difficulty: opts.difficulty || 'normal',
    density: sanitizeDensity(opts.chartDensity || DEFAULT_CHART_DENSITY),
    strategy: sanitizeStrategy(opts.analysisStrategy || ANALYSIS_STRATEGY),
    fullMax: FULL_ANALYSIS_MAX_SEC,
    segThreshold: SEGMENT_ANALYSIS_THRESHOLD_SEC,
    segWindow: SEGMENT_WINDOW_SEC,
    segOverlap: SEGMENT_OVERLAP_SEC,
    maxCapture: MAX_CAPTURE_SEC,
    schema: CHART_SCHEMA_VERSION,
    analysisV: 2
  });
  return createHash('sha1').update(raw).digest('hex').slice(0, 12);
}

function decideAnalysisMode(fullDuration, requestedStrategy = 'auto') {
  const strategy = sanitizeStrategy(requestedStrategy || ANALYSIS_STRATEGY);
  if (strategy === 'full') return 'full';
  if (strategy === 'segmented') return 'segmented-full';
  return Number(fullDuration || 0) > SEGMENT_ANALYSIS_THRESHOLD_SEC ? 'segmented-full' : 'full';
}

function readJsonIfExists(file) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return null;
}

function buildPatternProfile(seg, difficultyCfg, densityCfg = getDensityConfig('normal')) {
  const label = seg?.label || 'verse';
  const dense = seg?.energy === 'high' || Number(seg?.density || 0) > 1.8;
  // energyNorm (0=quietest section, 1=loudest): scale off-beat note budget with song energy
  const energyNorm = Math.max(0, Math.min(1, Number(seg?.energyNorm ?? 0.5)));
  const weakScale = Number(densityCfg.extraWeakScale || 1) * (0.65 + energyNorm * 0.7);
  const dragDensityBoost = Number(densityCfg.dragBoost || 0);
  // sustainRatio (0=pure drum, 1=pure tonal/vocal): modulate drag bias along the harmonic axis
  const sustainRatio = Math.max(0, Math.min(1, Number(seg?.sustainRatio ?? 0.5)));
  const sustainDragBoost = label === 'drop' ? -0.15 : (sustainRatio - 0.5) * 0.36;
  if (label === 'intro') return { strongOnly: false, extraWeak: 0.14 * difficultyCfg.weakChance * weakScale, dragBias: Math.max(0, 0.05 + difficultyCfg.dragBoost + dragDensityBoost + sustainDragBoost), jumpBias: 0.08, phraseSpan: 2 };
  if (label === 'drop') return { strongOnly: false, extraWeak: 0.38 * difficultyCfg.weakChance * weakScale, dragBias: Math.max(0.02, 0.06 + difficultyCfg.dragBoost + dragDensityBoost), jumpBias: 0.28, phraseSpan: 3 };
  if (label === 'chorus') return { strongOnly: false, extraWeak: 0.42 * difficultyCfg.weakChance * weakScale, dragBias: Math.max(0, 0.22 + difficultyCfg.dragBoost + dragDensityBoost + sustainDragBoost), jumpBias: 0.22, phraseSpan: 3 };
  if (label === 'break') return { strongOnly: true, extraWeak: 0.0, dragBias: 0.04 + difficultyCfg.dragBoost + dragDensityBoost, jumpBias: 0.04, phraseSpan: 1 };
  return { strongOnly: false, extraWeak: (dense ? 0.28 : 0.18) * difficultyCfg.weakChance * weakScale, dragBias: Math.max(0, 0.12 + difficultyCfg.dragBoost + dragDensityBoost + sustainDragBoost), jumpBias: dense ? 0.17 : 0.12, phraseSpan: dense ? 3 : 2 };
}

function stableRand(seed) {
  let x = Number(seed || 1) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17; x >>>= 0;
  x ^= x << 5; x >>>= 0;
  return (x % 10000) / 10000;
}

function pickPhraseIntent(seg, phraseIndex, t) {
  const label = seg?.label || 'verse';
  const dense = seg?.energy === 'high' || Number(seg?.density || 0) > 1.8;
  const gradient = seg?.gradient || 'stable';
  const vocalHeavy = seg?.vocalHeavy === true;
  const roll = stableRand(Math.round(Number(t || 0) * 1000) + phraseIndex * 97 + label.length * 53);
  if (label === 'intro') return roll < 0.7 ? 'settle' : 'drift';
  if (label === 'drop') return roll < 0.5 ? 'surge' : 'sweep'; // pure drum drop: aggressive outward taps
  // Energy gradient + vocal character take priority over static segment label
  if (gradient === 'rising') return vocalHeavy ? 'sweep' : (roll < 0.55 ? 'surge' : 'answer');
  if (gradient === 'falling' && label !== 'chorus') return vocalHeavy ? 'suspend' : (label === 'bridge' ? 'pivot' : 'drift');
  if (label === 'chorus') return vocalHeavy ? (roll < 0.5 ? 'sweep' : 'answer') : (roll < 0.34 ? 'surge' : (roll < 0.7 ? 'answer' : 'sweep'));
  if (label === 'bridge') return roll < 0.45 ? 'suspend' : 'pivot';
  if (vocalHeavy) return roll < 0.5 ? 'answer' : 'suspend';
  if (dense) return roll < 0.5 ? 'answer' : 'sweep';
  return roll < 0.5 ? 'drift' : 'pivot';
}

function nearestDownbeatDistance(downbeats, t) {
  if (!Array.isArray(downbeats) || !downbeats.length) return Infinity;
  let best = Infinity;
  for (const d of downbeats) best = Math.min(best, Math.abs(Number(d) - t));
  return best;
}
function pickSegmentForTime(segments, t) {
  return (segments || []).find(seg => t >= Number(seg.start || 0) && t < Number(seg.end || 0)) || null;
}

// classifyBeatSignal: pure audio-signal classifier — no caller state, safe to call anywhere
// Returns { noteType: 'tap'|'drag', confidence: 0–1 }
// confidence >= 0.70  → overrides phrase-system logic
// confidence 0.48–0.69 → nudges drag probability; phrase system still applies
// confidence < 0.48  → ambiguous, phrase system decides
function classifyBeatSignal(percStr, harmStr, seg, beatIntervalSec, bpm) {
  const bi = Number(beatIntervalSec || 0.5);
  const bpmN = Number(bpm || 120);
  // Fast tempo: drag is physically unplayable at high speed
  if (bpmN > 155 || bi < 0.35) return { noteType: 'tap', confidence: 0.90 };
  // Strong percussive transient clearly dominates — this is a drum hit
  if (percStr > 0.70 && percStr > harmStr * 1.40) return { noteType: 'tap', confidence: 0.82 };
  // Sustained tonal/vocal beat: harmonic dominant + adequate gap for drag
  const sustainRatio = Math.max(0, Math.min(1, Number(seg?.sustainRatio ?? 0.5)));
  if (harmStr > 0.55 && harmStr > percStr * 1.20 && sustainRatio > 0.50 && bi > 0.38) {
    return { noteType: 'drag', confidence: 0.78 };
  }
  // Moderate harmonic lean — influence drag probability without overriding
  if (harmStr > 0.40 && harmStr > percStr * 1.05 && bi > 0.42) {
    return { noteType: 'drag', confidence: 0.48 };
  }
  // Ambiguous — let phrase system decide
  return { noteType: 'tap', confidence: 0.28 };
}

function injectSpinProposals(notes, durationSec = 0) {
  const seq = Array.isArray(notes) ? notes.slice().sort((a, b) => Number(a.time || 0) - Number(b.time || 0)) : [];
  const duration = Number(durationSec || 0);
  if (!seq.length || duration < 40) return seq;
  const targets = [duration * 0.52, duration * 0.86];
  targets.forEach((target, idx) => {
    const nearest = seq.reduce((best, note) => {
      const dt = Math.abs(Number(note.time || 0) - target);
      return !best || dt < best.dt ? { note, dt } : best;
    }, null)?.note;
    const spinTime = Number(Math.max(6, Math.min(duration - 4, target)).toFixed(3));
    if (seq.some(n => Math.abs(Number(n.time || 0) - spinTime) < 2.4 && n.proposalType === 'spin')) return;
    seq.push({
      time: spinTime,
      proposalType: 'spin',
      type: 'tap',
      laneHint: 1,
      phrase: Number(nearest?.phrase || idx + 2),
      phraseIntent: 'sweep',
      phraseAnchor: 1,
      strength: 1,
      segmentLabel: idx === 0 ? (nearest?.segmentLabel || 'bridge') : 'outro',
      energy: 'high',
      duration: idx === 0 ? 2.2 : 2.8,
      exclusivity: 'solo-mouse'
    });
  });
  return seq.sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
}

function chartFromAnalysis(analysis, difficulty = "normal", chartDensity = 'normal') {
  const beats = Array.isArray(analysis?.beats) ? analysis.beats.map(Number).filter(n => Number.isFinite(n)) : [];
  const segments = Array.isArray(analysis?.segments) ? analysis.segments : [];
  const downbeats = Array.isArray(analysis?.downbeats) ? analysis.downbeats : [];
  const difficultyCfg = getDifficultyConfig(difficulty);
  const densityCfg = getDensityConfig(chartDensity);
  const bpm = Math.max(60, Math.min(220, Number(analysis?.bpm || 120)));
  const approachRateMs = Math.round(Math.max(950, Math.min(1600, (60000 / bpm) * 2.5)));
  if (beats.length < 16) {
    const fallback = simpleChart(Number(analysis?.duration || 45), "librosa-fallback");
    fallback.chartDensity = sanitizeDensity(chartDensity);
    fallback.difficulty = difficulty;
    return fallback;
  }

  const beatStrengths = Array.isArray(analysis?.beatStrengths) ? analysis.beatStrengths.map(Number) : [];
  const percussiveStrengths = Array.isArray(analysis?.percussiveStrengths) ? analysis.percussiveStrengths.map(Number) : [];
  const harmonicStrengths = Array.isArray(analysis?.harmonicStrengths) ? analysis.harmonicStrengths.map(Number) : [];
  const vocalOnsets = Array.isArray(analysis?.vocalOnsets) ? analysis.vocalOnsets : [];

  // --- Step 1: Compute per-segment note budgets ---
  const segBudgetPerSec = {
    intro: 0.8, verse: 1.4, chorus: 2.0, bridge: 1.3,
    break: 0.4, drop: 2.2, outro: 0.7
  };
  const segBudgets = new Map();
  for (const seg of segments) {
    const label = seg.label || 'verse';
    const dur = Math.max(1, Number(seg.end || 0) - Number(seg.start || 0));
    const base = (segBudgetPerSec[label] || 1.4) * dur;
    const scaled = Math.max(2, Math.round(base * difficultyCfg.maxNotesScale * Number(densityCfg.noteScale || 1)));
    segBudgets.set(seg, { budget: scaled, used: 0 });
  }

  // --- Step 2: Rank all beats by priority within their segment ---
  const beatCandidates = [];
  let phraseIndex = 0;
  for (let i = 0; i < beats.length; i++) {
    const t = Number(beats[i].toFixed(3));
    if (t < 1.0) continue;
    const seg = pickSegmentForTime(segments, t) || { label: 'verse', energy: 'mid', dragRatio: 0.16, density: 1.4 };
    const mod4 = i % 4;
    const mod8 = i % 8;
    const nearDownbeat = nearestDownbeatDistance(downbeats, t) < 0.08;
    const beatStr = Number.isFinite(beatStrengths[i]) ? Math.max(0, Math.min(1, beatStrengths[i])) : 0.5;
    const percStr = Number.isFinite(percussiveStrengths[i]) ? percussiveStrengths[i] : 0.5;
    const harmStr = Number.isFinite(harmonicStrengths[i]) ? harmonicStrengths[i] : 0.5;
    const beatInterval = i > 0 ? (beats[i] - beats[i - 1]) : (60 / bpm);
    const gapNext = i < beats.length - 1 ? (beats[i + 1] - beats[i]) : beatInterval;
    const isStrong = mod4 === 0;

    // Priority: downbeat > strong beat > audio-strong > pickup > weak
    let priority = 0;
    if (nearDownbeat) priority = 5;
    else if (isStrong) priority = 4;
    else if (beatStr > 0.75) priority = 3;
    else if (mod4 === 2) priority = 2;
    else priority = 1;

    if (mod8 === 0 || i === 0) phraseIndex += 1;

    beatCandidates.push({
      beatIndex: i, time: t, seg, priority, nearDownbeat, isStrong,
      beatStr, percStr, harmStr, beatInterval, gapNext,
      mod4, mod8, phraseIndex
    });
  }

  // --- Step 3: Select notes per segment by priority, respecting budget ---
  const notes = [];
  let lane = 1;
  let lastTime = -99;
  let lastType = 'tap';
  let phraseAnchor = 1;

  // Group candidates by segment
  const segGroups = new Map();
  for (const c of beatCandidates) {
    const key = segments.indexOf(c.seg);
    if (!segGroups.has(key)) segGroups.set(key, []);
    segGroups.get(key).push(c);
  }

  for (const [segIdx, candidates] of segGroups) {
    const seg = segIdx >= 0 ? segments[segIdx] : { label: 'verse', energy: 'mid', dragRatio: 0.16 };
    const budgetInfo = segBudgets.get(seg) || { budget: Math.max(4, candidates.length), used: 0 };
    const profile = buildPatternProfile(seg, difficultyCfg, densityCfg);

    // Sort by priority desc, then time asc
    const sorted = [...candidates].sort((a, b) => b.priority - a.priority || a.time - b.time);
    const selected = [];

    for (const c of sorted) {
      if (budgetInfo.used >= budgetInfo.budget) break;
      // Min gap check against already selected notes in this segment
      if (selected.some(s => Math.abs(s.time - c.time) < difficultyCfg.minGap)) continue;
      // Also check global lastTime for cross-segment continuity
      if (selected.length === 0 && c.time - lastTime < difficultyCfg.minGap * 0.8) continue;

      // Skip very weak beats in sparse segments
      if (c.priority <= 1 && (seg.label === 'intro' || seg.label === 'break' || seg.energy === 'low')) continue;

      selected.push(c);
      budgetInfo.used += 1;
    }

    // Re-sort selected by time for sequential processing
    selected.sort((a, b) => a.time - b.time);

    for (const c of selected) {
      const localRoll = stableRand(c.beatIndex * 131 + Math.round(c.time * 1000) + c.phraseIndex * 19);
      const phraseIntent = pickPhraseIntent(seg, c.phraseIndex, c.time);
      const signalClass = classifyBeatSignal(c.percStr, c.harmStr, seg, c.beatInterval, bpm);

      // Mechanic decision
      let type = 'tap';
      const segDrag = Number(seg.dragRatio || 0.16) + difficultyCfg.dragBoost + Number(densityCfg.dragBoost || 0);
      const dragWindow = c.gapNext > 0.35 && c.gapNext < 1.5;
      const introGuard = c.time < 4.8;
      if (!introGuard && signalClass.confidence >= 0.70 && (signalClass.noteType !== 'drag' || dragWindow)) {
        type = signalClass.noteType;
      } else if (!introGuard && dragWindow) {
        if (phraseIntent === 'sweep' && localRoll < Math.min(0.66, profile.dragBias + segDrag + 0.1)) type = 'drag';
        else if (phraseIntent === 'answer' && c.isStrong && localRoll < Math.min(0.52, profile.dragBias + segDrag)) type = 'drag';
        else if (signalClass.noteType === 'drag' && signalClass.confidence >= 0.48 && localRoll < Math.min(0.68, profile.dragBias + segDrag + 0.18)) type = 'drag';
      }
      if (lastType === type && type !== 'tap' && localRoll < 0.58) type = 'tap';

      // Lane movement
      let laneStep = 0;
      if (phraseIntent === 'sweep') laneStep = localRoll < profile.jumpBias ? (localRoll < 0.5 ? -2 : 2) : (localRoll < 0.5 ? -1 : 1);
      else if (phraseIntent === 'answer') laneStep = ((notes.length + c.phraseIndex) % 2 === 0 ? 1 : -1);
      else if (phraseIntent === 'pivot') laneStep = lane < phraseAnchor ? 1 : (lane > phraseAnchor ? -1 : (localRoll < 0.5 ? -1 : 1));
      else laneStep = lane < phraseAnchor ? 1 : (lane > phraseAnchor ? -1 : 0);
      lane = Math.max(0, Math.min(3, lane + laneStep));
      if (c.mod8 === 0) phraseAnchor = Math.max(0, Math.min(3, lane + (localRoll < 0.33 ? -1 : (localRoll > 0.66 ? 1 : 0))));

      // Strength
      const baseStrength = c.nearDownbeat ? 1.05 : (c.isStrong ? 1.0 : (seg.energy === 'high' ? 0.78 : 0.68));
      const audioStrength = c.beatStr > 0 ? 0.5 + c.beatStr * 0.6 : baseStrength;
      const strength = Number(Math.min(1.1, Math.max(
        (c.isStrong || c.nearDownbeat) ? baseStrength : 0.5,
        audioStrength
      )).toFixed(2));

      notes.push({
        time: c.time,
        proposalType: type,
        type: 'tap',
        laneHint: lane,
        phrase: c.phraseIndex,
        phraseIntent,
        phraseAnchor,
        strength,
        downbeatBias: c.nearDownbeat ? 0.15 : 0,
        segmentLabel: seg.label,
        energy: seg.energy
      });
      lastTime = c.time;
      lastType = type;
    }
  }

  notes.sort((a, b) => Number(a.time) - Number(b.time));

  // Vocal onset injection (budget-aware)
  const totalBudgetLeft = Math.max(0, Math.floor(notes.length * 0.15));
  const _vocalMinGap = difficultyCfg.minGap * 1.3;
  let _vocalCount = 0;
  for (const _vt of vocalOnsets) {
    if (_vocalCount >= totalBudgetLeft) break;
    const _t = Number(_vt);
    if (_t < 2.0) continue;
    if (notes.some(n => Math.abs(Number(n.time) - _t) < _vocalMinGap)) continue;
    const _vseg = pickSegmentForTime(segments, _t) || { label: 'verse', energy: 'mid', sustainRatio: 0.5, energyNorm: 0.5 };
    if (_vseg.label === 'intro' || _vseg.label === 'drop' || _vseg.label === 'break') continue;
    const _vSustain = Number(_vseg.sustainRatio ?? 0.5);
    const _prevNote = notes.filter(n => n.time < _t).slice(-1)[0];
    const _vGap = _prevNote ? (_t - Number(_prevNote.time)) : 1.0;
    const _vProposal = (_vSustain > 0.50 && _vGap > 0.38) ? 'drag' : 'tap';
    const _vRoll = stableRand(Math.round(_t * 1000) + 7331);
    const _vStrength = Number(Math.max(0.5, Math.min(1.0, 0.55 + Number(_vseg.energyNorm ?? 0.5) * 0.4)).toFixed(2));
    notes.push({
      time: Number(_t.toFixed(3)),
      proposalType: _vProposal,
      type: 'tap',
      laneHint: Math.round(_vRoll * 3),
      phrase: phraseIndex,
      phraseIntent: 'drift',
      phraseAnchor: 2,
      strength: _vStrength,
      downbeatBias: 0,
      segmentLabel: _vseg.label,
      energy: _vseg.energy,
      vocalInjected: true
    });
    _vocalCount++;
  }
  if (_vocalCount > 0) notes.sort((a, b) => Number(a.time) - Number(b.time));

  // Ensure at least one drag
  if (!notes.some(n => n.proposalType === 'drag')) {
    for (let i = 0; i < notes.length; i++) {
      if (notes[i].segmentLabel !== 'intro' && i % 6 === 0) {
        notes[i].proposalType = 'drag';
        break;
      }
    }
  }

  const final = injectSpinProposals(
    ensureTailCoverage(notes, Number(analysis?.duration || 45), difficulty, chartDensity),
    Number(analysis?.duration || 45)
  );
  return {
    version: CHART_SCHEMA_VERSION,
    algorithm: "librosa-budget-chart-v7",
    difficulty,
    approachRateMs,
    notes: final.length >= 16 ? final : simpleChart(Number(analysis?.duration || 45), "librosa-fallback").notes,
    chartDensity: sanitizeDensity(chartDensity)
  };
}

function mergeAnalysisWithChart(chart, analysis) {
  const segments = Array.isArray(analysis?.segments) ? analysis.segments : [];
  if (!segments.length) return { ...analysis, segments: buildSegmentsFromChart(chart, Number(analysis?.duration || 45)) };
  return analysis;
}

function downsampleNotesSpread(notes, keepCount) {
  if (!Array.isArray(notes) || notes.length <= keepCount) return Array.isArray(notes) ? notes.slice() : [];
  if (keepCount <= 1) return [notes[0]];
  const picked = [];
  const seen = new Set();
  const step = (notes.length - 1) / (keepCount - 1);
  for (let i = 0; i < keepCount; i++) {
    const idx = Math.max(0, Math.min(notes.length - 1, Math.round(i * step)));
    if (!seen.has(idx)) {
      picked.push(notes[idx]);
      seen.add(idx);
    }
  }
  if (picked.length < keepCount) {
    for (let i = 0; i < notes.length && picked.length < keepCount; i++) {
      if (!seen.has(i)) {
        picked.push(notes[i]);
        seen.add(i);
      }
    }
  }
  return picked.sort((a, b) => Number(a?.time || 0) - Number(b?.time || 0));
}

function ensureTailCoverage(notes, durationSec = 0, difficulty = 'normal', chartDensity = 'normal') {
  const duration = Number(durationSec || 0);
  if (!Array.isArray(notes) || !notes.length || duration < 20) return Array.isArray(notes) ? notes.slice() : [];
  const out = notes.slice().sort((a, b) => Number(a?.time || 0) - Number(b?.time || 0));
  const lastTime = Number(out[out.length - 1]?.time || 0);
  const gap = duration - lastTime;
  const densityCfg = getDensityConfig(chartDensity);
  if (gap <= Number(densityCfg.tailGapTarget || 3.2)) return out;

  const difficultyCfg = getDifficultyConfig(difficulty);
  const safeEnd = Math.max(lastTime + Math.max(0.6, difficultyCfg.minGap), duration - 0.9);
  const insertAt = Number(Math.min(duration - 0.45, safeEnd).toFixed(3));
  if (insertAt <= lastTime + difficultyCfg.minGap * 0.8) return out;

  const prev = out[out.length - 1] || { laneHint: 0, phrase: 0, strength: 0.85, segmentLabel: 'outro', energy: 'mid' };
  out.push({
    time: insertAt,
    proposalType: gap > 5.5 ? 'drag' : 'tap',
    type: 'tap',
    laneHint: (Number(prev.laneHint || 0) + 1) % 4,
    phrase: Number(prev.phrase || 0) + 1,
    strength: 0.9,
    segmentLabel: 'outro',
    energy: 'mid'
  });
  return out.sort((a, b) => Number(a?.time || 0) - Number(b?.time || 0));
}

function pickPreferredOverlapNote(prev, next) {
  if (!prev) return next;
  if (!next) return prev;
  const prevStrength = Number(prev?.strength || 0);
  const nextStrength = Number(next?.strength || 0);
  const prevDrag = prev?.type === 'drag' ? 0.08 : 0;
  const nextDrag = next?.type === 'drag' ? 0.08 : 0;
  const prevScore = prevStrength + prevDrag;
  const nextScore = nextStrength + nextDrag;
  if (nextScore > prevScore + 0.04) return next;
  if (prevScore > nextScore + 0.04) return prev;
  const prevLabel = String(prev?.segmentLabel || '');
  const nextLabel = String(next?.segmentLabel || '');
  if (nextLabel === 'chorus' && prevLabel !== 'chorus') return next;
  return prev;
}

function collapseOverlapNotes(notes) {
  const sorted = (notes || []).slice().sort((a, b) => Number(a?.time || 0) - Number(b?.time || 0));
  const out = [];
  for (const note of sorted) {
    const t = Number(note?.time || 0);
    const prev = out[out.length - 1];
    const prevTime = Number(prev?.time || -999);
    if (prev && t - prevTime < 0.08) {
      out[out.length - 1] = pickPreferredOverlapNote(prev, note);
      continue;
    }
    out.push(note);
  }
  return out;
}

function mergeChartNotes(charts, difficulty = 'normal', durationSec = 0, chartDensity = 'normal') {
  const merged = [];
  for (const chart of charts || []) {
    for (const note of (chart?.notes || [])) merged.push(note);
  }
  merged.sort((a, b) => Number(a?.time || 0) - Number(b?.time || 0));
  const deduped = collapseOverlapNotes(merged);
  const difficultyCfg = getDifficultyConfig(difficulty);
  const densityCfg = getDensityConfig(chartDensity);
  const keepCount = Math.max(24, Math.floor(deduped.length * difficultyCfg.maxNotesScale * Number(densityCfg.noteScale || 1)));
  const finalNotes = ensureTailCoverage(downsampleNotesSpread(deduped, keepCount), durationSec, difficulty, chartDensity);
  const mergedApproachRateMs = (charts || []).map(c => Number(c?.approachRateMs || 0)).find(v => v >= 950 && v <= 1600) || 1250;
  return {
    version: CHART_SCHEMA_VERSION,
    algorithm: 'hybrid-segment-chart-v4',
    difficulty,
    approachRateMs: mergedApproachRateMs,
    notes: finalNotes.length >= 16 ? finalNotes : simpleChart(Number(durationSec || 45), 'hybrid-fallback').notes,
    chartDensity: sanitizeDensity(chartDensity)
  };
}

function buildSegmentWindows(durationSec, windowSec = SEGMENT_WINDOW_SEC, overlapSec = SEGMENT_OVERLAP_SEC) {
  const duration = Math.max(0, Number(durationSec || 0));
  if (!duration) return [{ start: 0, end: 45 }];
  if (duration <= windowSec) return [{ start: 0, end: duration }];
  const stride = Math.max(5, windowSec - overlapSec);
  const windows = [];
  let start = 0;
  while (start < duration) {
    const end = Math.min(duration, start + windowSec);
    windows.push({ start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) });
    if (end >= duration) break;
    start += stride;
  }
  return windows;
}

async function analyzeChartWindow(url, cacheDir, meta, difficulty, chartDensity, optionsKey, startSec, endSec, jobId = null) {
  const idxLabel = `${optionsKey}_${String(startSec).replace(/\./g,'_')}_${String(endSec).replace(/\./g,'_')}`;
  const wavPath = path.join(cacheDir, `analysis_${idxLabel}.wav`);
  const cacheFile = path.join(cacheDir, `analysis_${idxLabel}.json`);
  const cached = readJsonIfExists(cacheFile);
  if (cached?.chart?.notes?.length && cached?.analysis) return cached;
  await captureAudioToWav(url, wavPath, cacheDir, endSec - startSec, jobId, startSec);

  let analysis;
  let chart;
  try {
    analysis = await analyzeRhythmWithPython(wavPath, cacheDir, jobId);
    chart = chartFromAnalysis(analysis, difficulty || 'normal', chartDensity || 'normal');
  } catch (_err) {
    chart = dspChartFromWav(wavPath);
    chart.difficulty = difficulty || 'normal';
    const durationSec = Number(endSec - startSec || 45);
    analysis = {
      duration: durationSec,
      bpm: estimateBpmFromChart(chart),
      beats: (chart.notes || []).map(n => n.time),
      segments: buildSegmentsFromChart(chart, durationSec),
      analyzer: 'dsp-fallback'
    };
  }

  const shiftedChart = {
    ...chart,
    notes: (chart.notes || []).map(n => ({ ...n, time: Number((Number(n.time || 0) + startSec).toFixed(3)) }))
  };
  const shiftedAnalysis = {
    ...analysis,
    duration: Number(meta?.duration || 0) || Number(endSec),
    beats: (analysis?.beats || []).map(t => Number((Number(t || 0) + startSec).toFixed(3))),
    downbeats: (analysis?.downbeats || []).map(t => Number((Number(t || 0) + startSec).toFixed(3))),
    segments: (analysis?.segments || []).map(seg => ({ ...seg, start: Number((Number(seg.start || 0) + startSec).toFixed(3)), end: Number((Number(seg.end || 0) + startSec).toFixed(3)) }))
  };
  const result = { chart: shiftedChart, analysis: shiftedAnalysis };
  try { fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2)); } catch {}
  tryDeleteFile(wavPath); // free disk: window WAV no longer needed
  return result;
}

async function tryDownloadToWav(url, workDir, jobId = null) {
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
        await runWithRetry("yt-dlp", ytDlpArgs(["--no-playlist", "--extractor-args", clientArg, "-f", fmt, "-o", sourceTpl, url]), workDir, 0, 180000, jobId);
        lastErr = null; break;
      } catch (e) { lastErr = e; }
    }
    if (lastErr) throw lastErr;
  } else {
    await runWithRetry("yt-dlp", ytDlpArgs(["-o", sourceTpl, url]), workDir, 0, 180000, jobId);
  }
  const downloaded = fs.readdirSync(workDir).find(f => f.startsWith("source."));
  if (!downloaded) throw new Error("media download failed");
  const downloadedPath = path.join(workDir, downloaded);
  await run("ffmpeg", ["-y", "-i", downloadedPath, "-ac", "1", "-ar", "44100", "-t", "360", wavPath], workDir, 120000, jobId);
  tryDeleteFile(downloadedPath); // keep cache small: source.* is only an intermediate
  return wavPath;
}

async function fetchYouTubeMeta(url) {
  try {
    const { stdout } = await run("yt-dlp", ytDlpArgs(["--skip-download", "--dump-single-json", "--no-playlist", url]), ROOT, 45000, null);
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

async function captureAudioToWav(url, wavPath, workDir, captureSec = 45, jobId = null, startSec = 0) {
  const sec = Math.max(8, Math.min(MAX_CAPTURE_SEC, Number(captureSec || 45)));
  const seek = Math.max(0, Number(startSec || 0));
  if (isYouTubeUrl(url)) {
    const streamUrl = await ytResolveAudioUrl(url);
    const args = ["-y"];
    if (seek > 0) args.push("-ss", String(seek));
    args.push("-t", String(sec), "-i", streamUrl, "-vn", "-ac", "1", "-ar", "44100", wavPath);
    await run("ffmpeg", args, workDir, Math.max(180000, sec * 1200), jobId);
    return { captureSec: sec, method: "youtube-stream", startSec: seek };
  }

  const downloadedWav = await tryDownloadToWav(url, workDir, jobId);
  const args = ["-y"];
  if (seek > 0) args.push("-ss", String(seek));
  args.push("-t", String(sec), "-i", downloadedWav, "-ac", "1", "-ar", "44100", wavPath);
  await run("ffmpeg", args, workDir, Math.max(120000, sec * 1000), jobId);
  return { captureSec: sec, method: "download-transcode", startSec: seek };
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
  const cap = await captureAudioToWav(job.url, wavPath, cacheDir, job.captureSec || 45, job.id);

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
    player: buildOnlinePlayerFromUrl(url),
    chartSeed: { bpm: 122, density: 1.0, pattern: "adaptive" },
    reason: reason || "offline fetch failed"
  };
}

function buildOnlinePlayerFromUrl(url) {
  if (isYouTubeUrl(url)) return { type: "youtube", videoId: extractVideoId(url) };
  if (looksLikeDirectMedia(url)) return { type: "audio", url };
  if (isBilibiliUrl(url)) return { type: "bilibili", url };
  return { type: "web", url };
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

function clampScore(value) {
  return Math.max(1, Math.min(10, Number(value || 0)));
}

function reviewChartPayload(payload) {
  const audit = payload?.audit || {};
  const mechanic = audit.mechanic || {};
  const spatial = audit.spatial || {};
  const geometry = audit.geometry || {};
  const chart = payload?.chart || {};
  const issues = [];
  const priorities = [];

  if (Number(spatial.largeJumpCount || 0) >= 3 || Number(spatial.avgLaneJump || 0) > 1.15) {
    issues.push({
      area: 'spatial',
      severity: 'high',
      evidence: `avgLaneJump=${Number(spatial.avgLaneJump || 0).toFixed(2)}, largeJumpCount=${Number(spatial.largeJumpCount || 0)}`,
      recommendation: 'Tighten locality bias and reduce cross-lane jump budget inside each phrase.'
    });
    priorities.push({ rank: 1, change: 'Reduce phrase-internal lane travel and cap consecutive wide jumps.', expectedImpact: 'Less frantic left/right snapping.' });
  }
  if (Number(spatial.directionReversalCount || 0) >= 3) {
    issues.push({
      area: 'spatial',
      severity: 'medium',
      evidence: `directionReversalCount=${Number(spatial.directionReversalCount || 0)}`,
      recommendation: 'Smooth motion arcs so patterns do not bounce direction every note.'
    });
  }
  if (Number(geometry.geometryRatio || 0) < 0.25) {
    issues.push({
      area: 'geometry',
      severity: 'high',
      evidence: `geometryRatio=${Number(geometry.geometryRatio || 0).toFixed(2)}, geometryCount=${Number(geometry.geometryCount || 0)}`,
      recommendation: 'Guarantee more non-orbit templates in chorus/bridge windows.'
    });
    priorities.push({ rank: 2, change: 'Raise non-orbit geometry floor and protect surviving geometry after conflict resolution.', expectedImpact: 'More memorable path mechanics.' });
  }
  if (Number(geometry.runtimeVisibleRatio || 0) < 0.7) {
    issues.push({
      area: 'geometry',
      severity: 'medium',
      evidence: `runtimeVisibleRatio=${Number(geometry.runtimeVisibleRatio || 0).toFixed(2)}`,
      recommendation: 'Promote geometry that remains visually distinct after runtime shaping.'
    });
  }
  if (Number(mechanic.tapRatio || 0) > 0.5) {
    issues.push({
      area: 'variety',
      severity: 'medium',
      evidence: `tapRatio=${Number(mechanic.tapRatio || 0).toFixed(2)}`,
      recommendation: 'Trade some tap density for drag/spin variation in mid-song windows.'
    });
  }
  if (Number(mechanic.latterSpecialRatio || 0) < 0.35) {
    issues.push({
      area: 'variety',
      severity: 'medium',
      evidence: `latterSpecialRatio=${Number(mechanic.latterSpecialRatio || 0).toFixed(2)}`,
      recommendation: 'Inject more late-song special mechanics to avoid flat endings.'
    });
  }
  const openingWindow = Array.isArray(chart.windows) ? chart.windows.find(w => Number(w.start || 0) < 8) : null;
  if (openingWindow && Number(openingWindow.sustain || 0) >= 3) {
    issues.push({
      area: 'opening',
      severity: 'medium',
      evidence: `opening sustain=${openingWindow.sustain} in first ${Number(openingWindow.end || 8)}s window`,
      recommendation: 'Preserve preview bias but delay heavy sustained stacking a bit further.'
    });
    priorities.push({ rank: 3, change: 'Extend post-countdown calm window or reduce early sustain clustering.', expectedImpact: 'Cleaner opening read.' });
  }

  const scores = {
    opening: clampScore(9.5 - Number((openingWindow?.sustain || 0) * 1.2) - Number(spatial.largeJumpCount || 0) * 0.3),
    variety: clampScore(8.8 - Number(mechanic.tapRatio || 0) * 7 + Number(mechanic.latterSpecialRatio || 0) * 3),
    spatialFlow: clampScore(9.2 - Number(spatial.avgLaneJump || 0) * 3 - Number(spatial.directionReversalCount || 0) * 0.4),
    geometrySurfacing: clampScore(3.5 + Number(geometry.geometryRatio || 0) * 6 + Number(geometry.runtimeVisibleRatio || 0) * 1.5)
  };

  priorities.sort((a, b) => a.rank - b.rank);
  return {
    summary: issues.length
      ? `Chart review found ${issues.length} notable issue(s). Strongest concern: ${issues[0].area}.`
      : 'Chart review found no major structural issues in the supplied audit.',
    scores,
    issues,
    priorities
  };
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
  const { url, difficulty } = req.body ?? {};
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url is required" });
  const sourceType = isYouTubeUrl(url) ? "youtube" : (looksLikeDirectMedia(url) ? "direct-media" : (isBilibiliUrl(url) ? "bilibili" : "webpage"));
  const preferred = LINK_PLAY_ONLY ? "online" : (sourceType === "webpage" ? "online" : "offline");
  res.json({ sourceType, preferredMode: preferred, fallbackMode: "online", linkPlayOnly: LINK_PLAY_ONLY });
});

app.post("/api/chart-review", (req, res) => {
  try {
    const payload = req.body?.payload;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'payload is required' });
    const review = reviewChartPayload(payload);
    res.json({ ok: true, review, model: 'local-heuristic-v1' });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
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
  ensureJobController(id);
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
  const { url, difficulty, captureSec, analysisStrategy, chartDensity } = req.body ?? {};
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url is required" });
  const id = nanoid(10);
  const now = new Date().toISOString();
  const job = { id, status: "pending", step: "queued", url, difficulty: ["easy","normal","hard"].includes(difficulty) ? difficulty : "normal", analysisStrategy: sanitizeStrategy(analysisStrategy || ANALYSIS_STRATEGY), chartDensity: sanitizeDensity(chartDensity || DEFAULT_CHART_DENSITY), createdAt: now, updatedAt: now, error: null, result: null };
  ensureJobController(id);
  saveJob(job);
  res.status(202).json({ jobId: id, status: job.status });

  // In link-play-only mode, analyze temporary preview audio first, then start online player with analyzed chart.
  // Keep Bilibili on the offline/download path so playback uses backend-produced media,
  // not a raw page URL fed into the browser player.
  if (LINK_PLAY_ONLY || isYouTubeUrl(url) || isBilibiliUrl(url)) {
    try {
      await processOnlineAnalyzedJob({ ...job, captureSec: Number(captureSec || 0), attempts: [] });
      return;
    } catch (err) {
      job.status = "done";
      job.step = "link play fallback";
      job.errorCode = classifyError(err);
      job.error = sanitizeError(err);
      job.result = buildOnlineFallback(url, "analysis failed, using seed mode");
      saveJob(job);
      return;
    }
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


app.post("/api/job/:id/cancel", (req, res) => {
  const job = loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: "job not found" });
  const result = cancelJob(job);
  res.json({ ok: result.ok, jobId: job.id, killed: result.killed || 0, status: job.status, step: job.step, error: job.error });
});

app.get("/api/debug/analysis-report/:id", (req, res) => {
  const job = loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: "job not found" });
  const analysis = job.result?.analysis;
  const chart = job.result?.chart;
  if (!analysis || !chart) return res.status(404).json({ error: "no result yet", jobStatus: job.status || "unknown", jobStep: job.step || null });
  const notes = chart.notes || [];
  const intervals = notes.slice(1).map((n, i) => Number(n.time) - Number(notes[i].time)).filter(v => v > 0);
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals.length ? intervals[Math.floor(intervals.length / 2)] : 0;
  const bpmForApproach = Math.max(60, Math.min(220, Number(analysis.bpm || 120)));
  const segments = (analysis.segments || []).map(s => ({
    label: s.label, start: s.start, end: s.end, energy: s.energy,
    noteCount: notes.filter(n => Number(n.time) >= Number(s.start) && Number(n.time) < Number(s.end)).length
  }));
  res.json({
    analysis: {
      bpm: analysis.bpm,
      duration: analysis.duration,
      fullDuration: analysis.fullDuration,
      beatCount: (analysis.beats || []).length,
      segmentCount: (analysis.segments || []).length
    },
    chart: {
      noteCount: notes.length,
      approachRateMs: chart.approachRateMs,
      firstNote: notes[0]?.time,
      lastNote: notes[notes.length - 1]?.time,
      difficulty: chart.difficulty,
      chartDensity: chart.chartDensity
    },
    diagnostics: {
      beatIntervalSec: Number((60 / bpmForApproach).toFixed(3)),
      computedApproachRateMs: Math.round(Math.max(950, Math.min(1600, (60000 / bpmForApproach) * 2.5))),
      medianNoteIntervalSec: Number(medianInterval.toFixed(3)),
      notesPerSec: Number((notes.length / Math.max(1, analysis.duration || 1)).toFixed(2))
    },
    segments
  });
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
