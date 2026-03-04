(function () {
  const API_BASE = window.RGB_API_BASE || (window.location.protocol + "//" + window.location.hostname + ":8787");

  async function waitForGame() {
    for (let i = 0; i < 50; i++) {
      if (window.game) return window.game;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("Game not initialized");
  }

  async function pollJob(jobId, statusText) {
    while (true) {
      const r = await fetch(`${API_BASE}/api/job/${jobId}`);
      const j = await r.json();
      statusText.innerHTML = `<div class="loading-message">${j.status} · ${j.step || ""}</div>`;
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
      statusText.innerHTML = "<div class=\"error-message\">Please paste a YouTube URL</div>";
      return;
    }

    try {
      statusText.innerHTML = "<div class=\"loading-message\">Submitting job...</div>";
      startButton.disabled = true;

      const create = await fetch(`${API_BASE}/api/analyze-youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const created = await create.json();
      if (!create.ok) throw new Error(created.error || "failed to create job");

      const job = await pollJob(created.jobId, statusText);
      const game = await waitForGame();

      const audioResp = await fetch(`${API_BASE}${job.result.audioUrl}`);
      const arrayBuffer = await audioResp.arrayBuffer();
      game.audioBuffer = await game.audioContext.decodeAudioData(arrayBuffer.slice(0));
      game.chartMode = true;
      game.chartData = job.result.chart;
      game.nextChartIndex = 0;

      statusText.innerHTML = `<div class="success-message">Ready: ${job.result.title || "YouTube Track"}</div>`;
      startButton.disabled = false;
    } catch (e) {
      statusText.innerHTML = `<div class="error-message">${e.message}</div>`;
    }
  }

  window.addEventListener("load", () => {
    const btn = document.getElementById("analyzeYoutube");
    if (btn) btn.addEventListener("click", loadFromYoutube);
  });
})();
