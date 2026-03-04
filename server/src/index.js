import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const JOBS_DIR = path.join(ROOT, "data", "jobs");

fs.mkdirSync(JOBS_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const jobs = new Map();

function saveJob(job) {
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

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "rgb-grid-effect-server" });
});

app.post("/api/analyze-youtube", (req, res) => {
  const { url } = req.body ?? {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url is required" });
  }

  const id = nanoid(10);
  const now = new Date().toISOString();
  const job = {
    id,
    status: "pending",
    url,
    createdAt: now,
    updatedAt: now,
    error: null,
    result: null
  };

  saveJob(job);
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
  if (job.status !== "done" || !job.result?.chart) {
    return res.status(409).json({ error: "chart not ready" });
  }
  res.json(job.result);
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`Server listening on :${port}`);
});
