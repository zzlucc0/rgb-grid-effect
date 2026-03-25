(function () {
  var API_BASE = window.RGB_API_BASE || (window.location.protocol + "//" + window.location.hostname + ":8787");
  var currentAnalyzeJobId = null;
  var analyzeCancelled = false;

  function el(id) { return document.getElementById(id); }

  // ── Browser-local chart cache (IndexedDB) ───────────────────────────────
  // Stores chart analysis results in the player's own browser.
  // Key: url + difficulty + density + strategy → { result, savedAt }
  // TTL: 7 days. No server storage consumed per player.
  var IDB_NAME = 'cyber-grid-chart-cache';
  var IDB_STORE = 'charts';
  var IDB_VERSION = 1;
  var IDB_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function openIDB() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'key' });
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function () { resolve(null); };
    });
  }

  function makeKey(url, difficulty, density, strategy) {
    return [url.trim(), difficulty || 'normal', density || 'normal', strategy || 'auto'].join('|');
  }

  function idbGet(url, difficulty, density, strategy) {
    return openIDB().then(function (db) {
      if (!db) return null;
      var key = makeKey(url, difficulty, density, strategy);
      return new Promise(function (resolve) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = function (e) {
          var rec = e.target.result;
          if (!rec) return resolve(null);
          if (Date.now() - (rec.savedAt || 0) > IDB_TTL_MS) {
            var del = db.transaction(IDB_STORE, 'readwrite');
            del.objectStore(IDB_STORE).delete(key);
            return resolve(null);
          }
          resolve(rec.result);
        };
        req.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }

  function idbSet(url, difficulty, density, strategy, result) {
    var mode = result && result.mode;
    // Don't cache offline modes (audio not stored in IDB)
    if (mode === 'offline' || mode === 'offline-capture-fallback' || mode === 'capture-poc') return Promise.resolve();
    return openIDB().then(function (db) {
      if (!db) return;
      var key = makeKey(url, difficulty, density, strategy);
      return new Promise(function (resolve) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put({ key: key, result: result, savedAt: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }).catch(function () {});
  }

  // Debug helpers exposed to browser console
  window._cyberGridCacheClear = function () {
    return openIDB().then(function (db) {
      if (!db) return;
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      console.log('[CyberGrid] Local chart cache cleared');
    });
  };
  window._cyberGridCacheList = function () {
    return openIDB().then(function (db) {
      if (!db) return [];
      return new Promise(function (resolve) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = function (e) {
          var rows = (e.target.result || []).map(function (r) {
            return { key: r.key, mode: r.result && r.result.mode, notes: r.result && r.result.chart && r.result.chart.notes && r.result.chart.notes.length, savedAt: new Date(r.savedAt).toISOString() };
          });
          console.table(rows);
          resolve(rows);
        };
      });
    });
  };
  // ────────────────────────────────────────────────────────────────────────
  function setStatus(type, text, metaHtml) {
    var box = el("statusText");
    if (!box) return;
    var cls = type === "error" ? "error-message" : (type === "success" ? "success-message" : "loading-message");
    box.innerHTML = '<div class="' + cls + '">' + text + '</div>' + (metaHtml ? ('<div class="note-message" style="margin-top:6px;font-size:12px;opacity:0.9;">' + metaHtml + '</div>') : '');
  }

  function humanModeLabel(mode) {
    var m = String(mode || '').trim();
    if (m === 'full') return 'Full-song analysis';
    if (m === 'segmented-full') return 'Segmented full-song analysis';
    if (m === 'online-analyzed') return 'Analyzed link mode';
    return m || '-';
  }


  function humanDensityLabel(mode) {
    var m = String(mode || '').trim();
    if (m === 'relaxed') return 'Relaxed density';
    if (m === 'dense') return 'Dense density';
    if (m === 'normal') return 'Normal density';
    return m || '-';
  }

  function formatAnalyzeMeta(job) {
    if (!job) return '';
    var bits = [];
    var mode = (job.analysisMode || (job.result && job.result.analysis && job.result.analysis.analysisMode) || '').trim();
    if (mode) bits.push(humanModeLabel(mode));
    var sp = job.segmentProgress;
    if (sp && sp.total) bits.push('segment ' + sp.index + '/' + sp.total + ' · ' + sp.start + '–' + sp.end + 's');
    var density = (job.chartDensity || (job.result && job.result.analysis && job.result.analysis.chartDensity) || '').trim();
    if (density) bits.push(humanDensityLabel(density));
    var capMeta = job.captureMeta || {};
    if (capMeta.duration) bits.push('song: ' + Math.round(capMeta.duration) + 's');
    return bits.join(' · ');
  }

  function ensureReadyPanel() {
    var panel = el("readyPanel");
    if (panel) return;
    var status = el("statusText");
    panel = document.createElement("div");
    panel.id = "readyPanel";
    panel.className = "info-message";
    panel.style.fontSize = "13px";
    panel.innerHTML = 'Mode: <span id="modeBadge">-</span> · Ready: <span id="readyBadge">no</span> · Notes: <span id="notesBadge">-</span> · Density: <span id="densityBadge">-</span>';
    if (status) status.insertAdjacentElement("afterend", panel);
  }
  function setReady(mode, ready, notes, density) {
    ensureReadyPanel();
    if (el("modeBadge")) el("modeBadge").textContent = mode || "-";
    if (el("readyBadge")) el("readyBadge").textContent = ready ? "yes" : "no";
    if (el("notesBadge")) el("notesBadge").textContent = String(notes == null ? "-" : notes);
    if (el("densityBadge")) el("densityBadge").textContent = density ? humanDensityLabel(density) : '-';
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
      
      var stepText = j.status + " · " + (j.step || "");
      if (j.step === "resolving stream") stepText = "Analyzing… resolving source";
      else if (j.step === "capturing preview audio") stepText = "Analyzing… capturing preview audio";
      else if (j.step === "capturing full audio") stepText = "Analyzing… capturing full song audio";
      else if (j.step === "analyzing rhythm") stepText = "Analyzing… detecting BPM / beats / segments";
      else if (/^analyzing segment /.test(j.step || '')) stepText = "Analyzing… building segmented full-song chart";
      else if (j.step === "analysis ready") stepText = "Analysis complete";
      if (window.game && window.game.setStatusMessage) window.game.setStatusMessage("loading", stepText, formatAnalyzeMeta(j));
      else setStatus("loading", stepText, formatAnalyzeMeta(j));

      if (analyzeCancelled) throw new Error("analysis cancelled");
      if (j.status === "done") return j;
      if (j.status === "failed") throw new Error(j.error || "analysis failed");
      await new Promise(function (r2) { setTimeout(r2, 1500); });
    }
  }

  async function applyJob(job) {
    var startBtn = el("startGame");
    var game = await waitForGame();

    if (job.result.mode === "online-analyzed") {
      var analyzedConfig = {
        bpm: (job.result.analysis && job.result.analysis.bpm) || 122,
        density: 1.0,
        pattern: "analyzed",
        strictPlayback: ((el("playModeSelect") && el("playModeSelect").value) || "casual") === "strict",
        playMode: ((el("playModeSelect") && el("playModeSelect").value) || "casual"),
        analysis: job.result.analysis,
        segments: (job.result.analysis && job.result.analysis.segments) || [],
        player: job.result.player
      };
      if (game.loadOnlineAnalyzedRuntime) game.loadOnlineAnalyzedRuntime(job.result.chart, analyzedConfig);
      startBtn.disabled = false;
      var analyzedNotes = (job.result.chart && job.result.chart.notes && job.result.chart.notes.length) || "-";
      if (game.setReadySummary) game.setReadySummary("online-analyzed", true, analyzedNotes, humanDensityLabel(job.result.analysis && job.result.analysis.chartDensity));
      else setReady("online-analyzed", true, analyzedNotes, job.result.analysis && job.result.analysis.chartDensity);
      var modeText = ((job.result.analysis && job.result.analysis.analysisMode) || job.analysisMode || 'full');
      if (game.setStatusMessage) game.setStatusMessage("success", "Analysis ready · BPM " + (((job.result.analysis && job.result.analysis.bpm) || 122)) + " · " + ((job.result.chart && job.result.chart.difficulty) || "normal") + " · " + ((((el("playModeSelect") && el("playModeSelect").value) || "casual")) ) + " · notes: " + (((job.result.chart && job.result.chart.notes && job.result.chart.notes.length) || 0)), humanModeLabel(modeText) + ((job.result.analysis && job.result.analysis.fullDuration) ? (" · cover ≈ " + Math.round(job.result.analysis.fullDuration) + "s") : ''));
      else setStatus("success", "Analysis ready · BPM " + (((job.result.analysis && job.result.analysis.bpm) || 122)) + " · " + ((job.result.chart && job.result.chart.difficulty) || "normal") + " · " + ((((el("playModeSelect") && el("playModeSelect").value) || "casual")) ) + " · notes: " + (((job.result.chart && job.result.chart.notes && job.result.chart.notes.length) || 0)), humanModeLabel(modeText) + ((job.result.analysis && job.result.analysis.fullDuration) ? (" · cover ≈ " + Math.round(job.result.analysis.fullDuration) + "s") : ''));
      return;
    }

    var onlineSeedConfig = {
      bpm: (job.result.chartSeed && job.result.chartSeed.bpm) || 122,
      density: (job.result.chartSeed && job.result.chartSeed.density) || 1.0,
      pattern: (job.result.chartSeed && job.result.chartSeed.pattern) || "adaptive",
      strictPlayback: true,
      player: job.result.player
    };
    if (game.loadOnlineSeedRuntime) game.loadOnlineSeedRuntime(onlineSeedConfig);
    startBtn.disabled = false;
    if (game.setReadySummary) game.setReadySummary("online", true, "live", '-');
    else setReady("online", true, "live", null);
    if (game.setStatusMessage) game.setStatusMessage("success", "Link-play ready (" + job.result.player.type + ")");
    else setStatus("success", "Link-play ready (" + job.result.player.type + ")");
    if (job.result.player.type === "web" || job.result.player.type === "bilibili") {
      if (game.setStatusMessage) game.setStatusMessage("error", "This link type may not support hidden autoplay in browser yet. Prefer YouTube/direct audio URL.");
      else setStatus("error", "This link type may not support hidden autoplay in browser yet. Prefer YouTube/direct audio URL.");
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
    var cancelBtn = el("cancelAnalyze");
    startBtn.disabled = true;
    analyzeCancelled = false;

    var difficulty  = (el("difficultySelect")       && el("difficultySelect").value)       || "normal";
    var density     = (el("chartDensitySelect")      && el("chartDensitySelect").value)      || "normal";
    var strategy    = (el("analysisStrategySelect")  && el("analysisStrategySelect").value)  || "auto";
    var playMode    = (el("playModeSelect")           && el("playModeSelect").value)           || "casual";
    var densityLabel = humanDensityLabel(density);

    if (window.game && window.game.setReadySummary) window.game.setReadySummary("-", false, "-", densityLabel);
    else setReady("-", false, "-", density);

    // ── 1. Check browser-local cache first ──────────────────────────────
    var cached = await idbGet(url, difficulty, density, strategy);
    if (cached) {
      if (window.game && window.game.setStatusMessage) window.game.setStatusMessage("loading", "Loading from local cache…");
      else setStatus("loading", "Loading from local cache…");
      if (window.setWaitProgress) window.setWaitProgress(90, "Found in local cache ✦");
      await applyJob({ result: cached });
      if (window.setWaitProgress) window.setWaitProgress(100, "Loaded from local cache ✦");
      return;
    }

    // ── 2. Server analysis ───────────────────────────────────────────────
    if (cancelBtn) cancelBtn.disabled = false;
    if (window.game && window.game.setStatusMessage) window.game.setStatusMessage("loading", "Analyzing link rhythm...");
    else setStatus("loading", "Analyzing link rhythm...");

    var resp = await fetch(API_BASE + "/api/analyze-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url, difficulty: difficulty, playMode: playMode, analysisStrategy: strategy, chartDensity: density })
    });
    var created = await resp.json();
    currentAnalyzeJobId = created.jobId || null;
    if (!resp.ok) throw new Error(created.error || "submit failed");
    var job = await pollJob(created.jobId);
    currentAnalyzeJobId = null;
    if (cancelBtn) cancelBtn.disabled = true;

    // ── 3. Save to browser cache before applying ─────────────────────────
    if (job && job.result) await idbSet(url, difficulty, density, strategy, job.result);

    await applyJob(job);
  }

  async function onAnalyzeClick() {
    try {
      var url = (el("youtubeUrl") && el("youtubeUrl").value || "").trim();
      if (!url) {
        if (window.game && window.game.setStatusMessage) window.game.setStatusMessage("error", "Please paste a media link");
        else setStatus("error", "Please paste a media link");
        return;
      }
      await analyzeUrl(url);
    } catch (e) {
      if (el("cancelAnalyze")) el("cancelAnalyze").disabled = true;
      currentAnalyzeJobId = null;
      if (window.game && window.game.setStatusMessage) window.game.setStatusMessage("error", e.message || "Unknown error");
      else setStatus("error", e.message || "Unknown error");
      if (window.game && window.game.setReadySummary) window.game.setReadySummary("error", false, "-", '-');
      else setReady("error", false, "-", null);
      if (window.game && window.game.clearLoadedState) {
        window.game.clearLoadedState(e.message || 'Unknown error');
      }
      if (el("startGame")) el("startGame").disabled = true;
    }
  }

  async function onCancelAnalyze() {
    analyzeCancelled = true;
    var jid = currentAnalyzeJobId;
    currentAnalyzeJobId = null;
    if (el("cancelAnalyze")) el("cancelAnalyze").disabled = true;
    if (el("startGame")) el("startGame").disabled = true;
    try {
      if (jid) {
        await fetch(API_BASE + "/api/job/" + jid + "/cancel", { method: "POST" });
      }
    } catch (_) {}
    if (window.game && window.game.setStatusMessage) window.game.setStatusMessage("error", "Analysis cancelled");
    else setStatus("error", "Analysis cancelled");
    if (window.game && window.game.setReadySummary) window.game.setReadySummary("cancelled", false, "-", '-');
    else setReady("cancelled", false, "-", null);
    if (window.game && window.game.clearLoadedState) {
      window.game.clearLoadedState('Analysis cancelled');
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
    var cbtn = el("cancelAnalyze");
    if (cbtn) cbtn.addEventListener("click", function () { onCancelAnalyze().catch(function(){}); });
    var sbtn = el("searchBiliBtn");
    if (sbtn) sbtn.addEventListener("click", onSearchBiliClick);
  });
})();
