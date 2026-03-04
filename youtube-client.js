(function () {
  const API_BASE = window.RGB_API_BASE || (window.location.protocol + "//" + window.location.hostname + ":8787");

  function setStatus(el, type, text) {
    const cls = type === "error" ? "error-message" : type === "success" ? "success-message" : "loading-message";
    el.innerHTML = `<div class="${cls}">${text}</div>`;
  }

  async function waitForGame() {
    for (let i = 0; i < 80; i++) {
      if (window.game) return window.game;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("Game engine init timeout. Refresh and retry.");
  }

  async function pollJob(jobId, statusText) {
    while (true) {
      const r = await fetch(`${API_BASE}/api/job/${jobId}`);
      const j = await r.json();
      setStatus(statusText, "loading", `${j.status} · ${j.step || ""}`);
      if (j.status === "done") return j;
      if (j.status === "failed") throw new Error(j.error || "analysis failed");
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  async function loadFromYoutube() {
    const input = document.getElementById("youtubeUrl");
    const statusText = document.getElementById("statusText");
    const startButton = document.getElementById("startGame");
    const url = input.value.trim();

    if (!url) {
      setStatus(statusText, "error", "Please paste a YouTube URL");
      return;
    }

    try {
      setStatus(statusText, "loading", "Checking service...");
      startButton.disabled = true;

      const health = await fetch(`${API_BASE}/health`);
      if (!health.ok) throw new Error("API unavailable");

      setStatus(statusText, "loading", "Submitting job...");
      const create = await fetch(`${API_BASE}/api/analyze-youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const created = await create.json();
      if (!create.ok) throw new Error(created.error || "failed to create job");

      const job = await pollJob(created.jobId, statusText);

      setStatus(statusText, "loading", "Initializing game engine...");
      const game = await waitForGame();

      setStatus(statusText, "loading", "Loading generated audio...");
      const audioResp = await fetch(`${API_BASE}${job.result.audioUrl}`);
      if (!audioResp.ok) throw new Error("audio fetch failed");

      const arrayBuffer = await audioResp.arrayBuffer();
      game.audioBuffer = await game.audioContext.decodeAudioData(arrayBuffer.slice(0));
      game.chartMode = true;
      game.chartData = job.result.chart;
      game.nextChartIndex = 0;

      setStatus(statusText, "success", `Ready: ${job.result.title || "YouTube Track"} · notes: ${job.result.chart.notes.length}`);
      startButton.disabled = false;
    } catch (e) {
      setStatus(statusText, "error", e.message || "Unknown error");
      startButton.disabled = true;
    }
  }

  window.addEventListener("load", () => {
    const btn = document.getElementById("analyzeYoutube");
    if (btn) btn.addEventListener("click", loadFromYoutube);
  });
})();
