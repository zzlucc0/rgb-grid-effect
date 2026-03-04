(function () {
  const API_BASE = window.RGB_API_BASE || (window.location.protocol + "//" + window.location.hostname + ":8787");

  function setStatus(el, type, text) {
    var cls = type === "error" ? "error-message" : (type === "success" ? "success-message" : "loading-message");
    el.innerHTML = "<div class=\"" + cls + "\">" + text + "</div>";
  }

  function ensureReadyPanel() {
    var panel = document.getElementById("readyPanel");
    if (!panel) {
      var status = document.getElementById("statusText");
      panel = document.createElement("div");
      panel.id = "readyPanel";
      panel.className = "info-message";
      panel.style.fontSize = "13px";
      panel.innerHTML = "Mode: <span id=\"modeBadge\">-</span> · Ready: <span id=\"readyBadge\">no</span> · Notes: <span id=\"notesBadge\">-</span>";
      if (status) status.insertAdjacentElement("afterend", panel);
    }
  }

  function setReadyInfo(mode, ready, notes) {
    ensureReadyPanel();
    var m = document.getElementById("modeBadge");
    var r = document.getElementById("readyBadge");
    var n = document.getElementById("notesBadge");
    if (m) m.textContent = mode || "-";
    if (r) r.textContent = ready ? "yes" : "no";
    if (n) n.textContent = String(notes == null ? "-" : notes);
  }

  async function waitForGame() {
    for (var i = 0; i < 100; i++) {
      if (window.game) return window.game;
      await new Promise(function (res) { setTimeout(res, 100); });
    }
    throw new Error("Game engine init timeout");
  }

  async function pollJob(jobId, statusText) {
    while (true) {
      var r = await fetch(API_BASE + "/api/job/" + jobId);
      var j = await r.json();
      setStatus(statusText, "loading", j.status + " · " + (j.step || ""));
      if (j.status === "done") return j;
      if (j.status === "failed") throw new Error(j.error || "analysis failed");
      await new Promise(function (res) { setTimeout(res, 1500); });
    }
  }

  async function loadFromLink() {
    var input = document.getElementById("youtubeUrl");
    var statusText = document.getElementById("statusText");
    var startButton = document.getElementById("startGame");
    var url = (input && input.value || "").trim();
    if (!url) return setStatus(statusText, "error", "Please paste a media link");

    startButton.disabled = true;
    setReadyInfo("-", false, "-");

    try {
      setStatus(statusText, "loading", "Submitting link...");
      var resp = await fetch(API_BASE + "/api/analyze-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url })
      });
      var created = await resp.json();
      if (!resp.ok) throw new Error(created.error || "submit failed");

      var job = await pollJob(created.jobId, statusText);
      var game = await waitForGame();

      if (job.result.mode === "offline") {
        setStatus(statusText, "loading", "Loading analyzed audio...");
        var audioResp = await fetch(API_BASE + job.result.audioUrl);
        if (!audioResp.ok) throw new Error("audio fetch failed");
        var arrayBuffer = await audioResp.arrayBuffer();
        game.audioBuffer = await game.audioContext.decodeAudioData(arrayBuffer.slice(0));
        game.chartMode = true;
        game.liveMode = false;
        game.liveConfig = null;
        game.chartData = job.result.chart;
        game.nextChartIndex = 0;
        game.readyMode = "offline";
        startButton.disabled = false;
        setReadyInfo("offline", true, job.result.chart.notes.length);
        setStatus(statusText, "success", "Offline ready · notes: " + job.result.chart.notes.length);
      } else {
        game.liveMode = true;
        game.chartMode = false;
        game.audioBuffer = null;
        game.chartData = null;
        game.liveConfig = { bpm: (job.result.chartSeed && job.result.chartSeed.bpm) || 122, player: job.result.player };
        game.readyMode = "online";
        startButton.disabled = false;
        setReadyInfo("online", true, "live");
        setStatus(statusText, "success", "Online fallback ready (" + job.result.player.type + ")");
      }
    } catch (e) {
      setStatus(statusText, "error", e.message || "Unknown error");
      startButton.disabled = true;
      setReadyInfo("error", false, "-");
    }
  }

  window.addEventListener("load", function () {
    ensureReadyPanel();
    var btn = document.getElementById("analyzeYoutube");
    if (btn) btn.addEventListener("click", loadFromLink);
  });
})();
