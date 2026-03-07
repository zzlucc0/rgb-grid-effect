import fs from "fs";

const base = process.env.API_BASE || "http://127.0.0.1:8878";
const timeoutMs = Number(process.env.JOB_TIMEOUT_MS || 45000);
const pollMs = Number(process.env.POLL_MS || 1200);

const urls = (process.env.URLS || [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?v=9bZkp7q19f0",
  "https://www.youtube.com/watch?v=YQHsXMglC9A",
  "https://www.youtube.com/watch?v=3JZ_D3ELwOQ",
  "https://www.bilibili.com/video/BV1xx411c7mD"
].join(",")).split(",").map(s => s.trim()).filter(Boolean);
const rounds = Math.max(1, Number(process.env.ROUNDS || 1));

async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t}`);
  return j;
}

async function getJson(url) {
  const r = await fetch(url);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t}`);
  return j;
}

async function waitJob(jobId) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const j = await getJson(`${base}/api/job/${jobId}`);
    if (["done", "failed"].includes(j.status)) return j;
    await new Promise(r => setTimeout(r, pollMs));
  }
  throw new Error(`job ${jobId} timeout`);
}

const out = [];
for (let r = 1; r <= rounds; r++) {
  for (const url of urls) {
    const row = { round: r, url, ok: false };
    try {
      const submit = await postJson(`${base}/api/analyze-link`, { url });
      const job = await waitJob(submit.jobId);
      row.status = job.status;
      row.step = job.step;
      row.errorCode = job.errorCode || null;
      row.error = job.error || null;
      row.mode = job.result?.mode || null;
      row.audioUrl = job.result?.audioUrl || null;
      row.attempts = job.attempts || [];
      row.ok = job.status === "done";
    } catch (e) {
      row.error = String(e.message || e);
    }
    out.push(row);
  }
}

const summary = {
  base,
  total: out.length,
  ok: out.filter(x => x.ok).length,
  failed: out.filter(x => !x.ok).length,
  details: out
};

const reportPath = new URL("../data/loop-test-report.json", import.meta.url);
fs.mkdirSync(new URL("../data", import.meta.url), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
