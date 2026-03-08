(function () {
  var API_BASE = window.RGB_API_BASE || (window.location.protocol + "//" + window.location.hostname + ":8787");

  function el(id) { return document.getElementById(id); }
  function setStatus(type, text) {
    var box = el("statusText");
    if (!box) return;
    var cls = type === "error" ? "error-message" : (type === "success" ? "success-message" : "loading-message");
    box.innerHTML = '<div class="' + cls + '">' + text + '</div>';
  }
  function ensureReadyPanel() {
    var panel = el("readyPanel");
    if (panel) return;
    var status = el("statusText");
    panel = document.createElement("div");
    panel.id = "readyPanel";
    panel.className = "info-message";
    panel.style.fontSize = "13px";
    panel.innerHTML = 'Mode: <span id="modeBadge">-</span> · Ready: <span id="readyBadge">no</span> · Notes: <span id="notesBadge">-</span>';
    if (status) status.insertAdjacentElement("afterend", panel);
  }
  function setReady(mode, ready, notes) {
    ensureReadyPanel();
    if (el("modeBadge")) el("modeBadge").textContent = mode || "-";
    if (el("readyBadge")) el("readyBadge").textContent = ready ? "yes" : "no";
    if (el("notesBadge")) el("notesBadge").textContent = String(notes == null ? "-" : notes);
  }

  function ensureSearchPanel() {
    var panel = el("searchPanel");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "searchPanel";
    panel.style.marginTop = "10px";
    panel.style.display = "none";
    panel.innerHTML = '' +
      '<div class="info-message" style="margin-bottom:8px;">Can\'t fetch this link. Search song on Bilibili:</div>' +
      '<input id="songQuery" type="text" placeholder="Song name" style="width:220px; padding:6px; border-radius:4px; border:1px solid #19A336; background:#111; color:#fff;">' +
      '<button id="searchBiliBtn" style="margin-left:8px;">Search</button>' +
      '<div id="searchResults" style="margin-top:8px; max-height:220px; overflow:auto;"></div>';
    var upload = el("uploadContainer");
    if (upload) upload.appendChild(panel);
    return panel;
  }

  async function waitForGame() {
    for (var i = 0; i < 120; i++) {
      if (window.game) return window.game;
      await new Promise(function (r) { setTimeout(r, 100); });
    }
    throw new Error("Game engine init timeout");
  }

  async function pollJob(jobId) {
    while (true) {
      var r = await fetch(API_BASE + "/api/job/" + jobId);
      var j = await r.json();
      setStatus("loading", j.status + " · " + (j.step || ""));
      if (j.status === "done") return j;
      if (j.status === "failed") throw new Error(j.error || "analysis failed");
      await new Promise(function (r2) { setTimeout(r2, 1500); });
    }
  }

  async function applyJob(job) {
    var startBtn = el("startGame");
    var game = await waitForGame();

    if (job.result.mode === "offline" || job.result.mode === "offline-capture-fallback" || job.result.mode === "capture-poc") {
      // Prefer proven buffer playback path for reliability.
      setStatus("loading", "Loading analyzed audio...");
      try {
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
        startBtn.disabled = false;
        setReady("offline", true, job.result.chart.notes.length);
        setStatus("success", "Offline ready · notes: " + job.result.chart.notes.length);
      } catch (e) {
        // fallback to live stream mode when decode path fails
        game.chartMode = true;
        game.chartData = job.result.chart;
        game.nextChartIndex = 0;
        game.liveMode = true;
        if (job.result.hlsUrl) {
          game.liveConfig = {
            bpm: 122,
            player: { type: "hls", url: API_BASE + job.result.hlsUrl },
            fallbackAudioUrl: API_BASE + job.result.audioUrl
          };
        } else {
          game.liveConfig = { bpm: 122, player: { type: "audio", url: API_BASE + job.result.audioUrl } };
        }
        game.readyMode = "offline";
        startBtn.disabled = false;
        setReady("offline", true, job.result.chart.notes.length + " notes");
        setStatus("success", "Offline ready · stream fallback · notes: " + job.result.chart.notes.length);
      }
      if (el("searchPanel")) el("searchPanel").style.display = "none";
      return;
    }

    if (job.result.mode === "online-analyzed") {
      game.liveMode = true;
      game.chartMode = true;
      game.audioBuffer = null;
      game.chartData = job.result.chart;
      game.nextChartIndex = 0;
      game.liveConfig = {
        bpm: (job.result.analysis && job.result.analysis.bpm) || 122,
        density: 1.0,
        pattern: "analyzed",
        strictPlayback: true,
        analysis: job.result.analysis,
        player: job.result.player
      };
      game.readyMode = "online-analyzed";
      startBtn.disabled = false;
      setReady("online-analyzed", true, (job.result.chart && job.result.chart.notes && job.result.chart.notes.length) || "-");
      setStatus("success", "Analysis ready · BPM " + (((job.result.analysis && job.result.analysis.bpm) || 122)) + " · notes: " + (((job.result.chart && job.result.chart.notes && job.result.chart.notes.length) || 0)));
      return;
    }

    game.liveMode = true;
    game.chartMode = false;
    game.audioBuffer = null;
    game.chartData = null;
    game.liveConfig = {
      bpm: (job.result.chartSeed && job.result.chartSeed.bpm) || 122,
      density: (job.result.chartSeed && job.result.chartSeed.density) || 1.0,
      pattern: (job.result.chartSeed && job.result.chartSeed.pattern) || "adaptive",
      strictPlayback: true,
      player: job.result.player
    };
    game.readyMode = "online";
    startBtn.disabled = false;
    setReady("online", true, "live");
    setStatus("success", "Link-play ready (" + job.result.player.type + ")");
    if (job.result.player.type === "web" || job.result.player.type === "bilibili") {
      setStatus("error", "This link type may not support hidden autoplay in browser yet. Prefer YouTube/direct audio URL.");
    }

    if (job.error) {
      var panel = ensureSearchPanel();
      panel.style.display = "block";
      var q = el("songQuery");
      if (q && !q.value) q.value = (el("youtubeUrl") && el("youtubeUrl").value) || "";
    }
  }

  async function analyzeUrl(url) {
    var startBtn = el("startGame");
    startBtn.disabled = true;
    setReady("-", false, "-");
    setStatus("loading", "Analyzing link rhythm...");
    var resp = await fetch(API_BASE + "/api/analyze-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url })
    });
    var created = await resp.json();
    if (!resp.ok) throw new Error(created.error || "submit failed");
    var job = await pollJob(created.jobId);
    await applyJob(job);
  }

  async function onAnalyzeClick() {
    try {
      var url = (el("youtubeUrl") && el("youtubeUrl").value || "").trim();
      if (!url) return setStatus("error", "Please paste a media link");
      await analyzeUrl(url);
    } catch (e) {
      setStatus("error", e.message || "Unknown error");
      setReady("error", false, "-");
      if (el("startGame")) el("startGame").disabled = true;
    }
  }

  async function onSearchBiliClick() {
    var query = (el("songQuery") && el("songQuery").value || "").trim();
    if (!query) return setStatus("error", "Enter song name first");
    setStatus("loading", "Searching Bilibili...");
    var r = await fetch(API_BASE + "/api/search-bilibili", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query, limit: 6 })
    });
    var data = await r.json();
    if (!r.ok) return setStatus("error", data.error || "search failed");

    var box = el("searchResults");
    box.innerHTML = "";
    if (!data.results || !data.results.length) {
      box.innerHTML = '<div class="error-message">No candidates found. Try Chinese title or artist + song name.</div>';
      return;
    }

    data.results.forEach(function (it, idx) {
      var row = document.createElement("div");
      row.style.padding = "6px";
      row.style.border = "1px solid rgba(255,255,255,0.2)";
      row.style.marginBottom = "6px";
      row.style.borderRadius = "6px";
      var dur = it.duration ? (Math.floor(it.duration/60) + ":" + String(it.duration%60).padStart(2,"0")) : "--";
      row.innerHTML = '<div style="font-size:13px;margin-bottom:4px;">' + (idx+1) + '. ' + it.title + ' · ' + dur + '</div>' +
        '<button data-url="' + it.url.replace(/"/g, '&quot;') + '">Use this</button>';
      row.querySelector("button").addEventListener("click", async function () {
        try {
          await analyzeUrl(it.url);
        } catch (e) {
          setStatus("error", e.message || "analyze failed");
        }
      });
      box.appendChild(row);
    });

    setStatus("success", "Select one result to continue");
  }

  window.addEventListener("load", function () {
    ensureReadyPanel();
    ensureSearchPanel();
    var btn = el("analyzeYoutube");
    if (btn) btn.addEventListener("click", onAnalyzeClick);
    var sbtn = el("searchBiliBtn");
    if (sbtn) sbtn.addEventListener("click", onSearchBiliClick);
  });
})();
