(function () {
  const API_BASE = window.RGB_API_BASE || (window.location.protocol + "//" + window.location.hostname + ":8787");

  function setStatus(el, type, text) {
    const cls = type === "error" ? "error-message" : type === "success" ? "success-message" : "loading-message";
    el.innerHTML = `<div class="${cls}">${text}</div>`;
  }

  async function waitForGame() {
    for (let i = 0; i < 100; i++) {
      if (window.game) return window.game;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("Game engine init timeout.");
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

  async function loadFromLink() {
    const input = document.getElementById("youtubeUrl");
    const statusText = document.getElementById("statusText");
    const startButton = document.getElementById("startGame");
    const url = input.value.trim();
    if (!url) return setStatus(statusText, "error", "Please paste a media link");

    try {
      startButton.disabled = true;
      setStatus(statusText, "loading", "Submitting link...");
      const resp = await fetch(`${API_BASE}/api/analyze-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const created = await resp.json();
      if (!resp.ok) throw new Error(created.error || "submit failed");

      const job = await pollJob(created.jobId, statusText);
      const game = await waitForGame();

      if (job.result.mode === "offline") {
        setStatus(statusText, "loading", "Loading analyzed audio...");
        const audioResp = await fetch(`${API_BASE}${job.result.audioUrl}`);
        if (!audioResp.ok) throw new Error("audio fetch failed");
        const arrayBuffer = await audioResp.arrayBuffer();
        game.audioBuffer = await game.audioContext.decodeAudioData(arrayBuffer.slice(0));
        game.chartMode = true;
        game.liveMode = false;
        game.chartData = job.result.chart;
        game.nextChartIndex = 0;
        setStatus(statusText, "success", `Offline ready · notes: ${job.result.chart.notes.length}`);
      } else {
        game.liveMode = true;
        game.chartMode = false;
        game.liveConfig = {
          bpm: job.result.chartSeed?.bpm || 122,
          player: job.result.player
        };
        setStatus(statusText, "success", `Online fallback ready (${job.result.player.type})`);
      }

      startButton.disabled = false;
    } catch (e) {
      setStatus(statusText, "error", e.message || "Unknown error");
      startButton.disabled = true;
    }
  }

  window.addEventListener("load", () => {
    const btn = document.getElementById("analyzeYoutube");
    if (btn) btn.addEventListener("click", loadFromLink);
  });
})();
