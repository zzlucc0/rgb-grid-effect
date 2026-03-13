(function () {
  function round(value, digits = 3) {
    const n = Number(value || 0);
    const p = 10 ** digits;
    return Math.round(n * p) / p;
  }

  function summarizeSegments(notes) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const bySegment = new Map();
    for (const note of seq) {
      const key = note.segmentLabel || 'unknown';
      if (!bySegment.has(key)) bySegment.set(key, []);
      bySegment.get(key).push(note);
    }
    return [...bySegment.entries()].map(([segment, entries]) => {
      const first = entries[0];
      const last = entries[entries.length - 1];
      const types = entries.map(n => n.type || n.noteType || 'tap');
      const uniqueTypes = [...new Set(types)];
      return {
        segment,
        start: round(first?.time || 0, 2),
        end: round(last?.time || 0, 2),
        count: entries.length,
        uniqueTypes,
        dominantType: uniqueTypes.map(type => ({ type, count: types.filter(v => v === type).length }))
          .sort((a, b) => b.count - a.count)[0]?.type || 'tap'
      };
    });
  }

  function summarizeWindows(notes, windowSec = 8) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    if (!seq.length) return [];
    const lastTime = Number(seq[seq.length - 1]?.time || 0);
    const windows = [];
    for (let start = 0; start <= lastTime + 0.001; start += windowSec) {
      const end = start + windowSec;
      const entries = seq.filter(n => Number(n.time || 0) >= start && Number(n.time || 0) < end);
      if (!entries.length) continue;
      const types = entries.map(n => n.type || n.noteType || 'tap');
      const geometry = entries.filter(n => ['diamondLoop', 'starTrace'].includes(n.pathTemplate)).length;
      windows.push({
        start: round(start, 2),
        end: round(end, 2),
        count: entries.length,
        taps: types.filter(v => v === 'tap').length,
        sustain: types.filter(v => ['drag', 'ribbon', 'pulseHold'].includes(v)).length,
        accents: types.filter(v => ['flick', 'cut', 'gate'].includes(v)).length,
        geometry
      });
    }
    return windows.slice(0, 8);
  }

  function buildReviewerPayload(chart, diagnostics = {}) {
    const notes = [...(chart?.notes || [])];
    const audit = diagnostics.chartShapeAudit || (window.ChartPolicy?.auditChartShape ? window.ChartPolicy.auditChartShape(notes) : null) || {};
    return {
      schema: 'rgb-grid-review.v1',
      chart: {
        noteCount: notes.length,
        durationSec: round(Number(notes[notes.length - 1]?.time || 0), 2),
        openingSeconds: 12,
        windows: summarizeWindows(notes),
        segments: summarizeSegments(notes)
      },
      audit: {
        mechanic: audit.mechanic || null,
        spatial: audit.spatial || null,
        geometry: audit.geometry || null
      },
      diagnostics: {
        lastChartSpawnAt: diagnostics.lastChartSpawnAt ?? null,
        lastChartSpawnCount: diagnostics.lastChartSpawnCount ?? null,
        lastSpawnedCount: diagnostics.lastSpawnedCount ?? null
      }
    };
  }

  function buildReviewerPrompt(payload) {
    return [
      'You are reviewing an auto-generated rhythm chart for human play feel.',
      'Focus on four things: opening buffer, mechanic templating, spatial rigidity, and geometry-path surfacing.',
      'Return JSON with keys: summary, scores, issues, priorities.',
      'scores must include: opening, variety, spatialFlow, geometrySurfacing (1-10).',
      'Each item in issues must include: area, severity, evidence, recommendation.',
      'Each item in priorities must include: rank, change, expectedImpact.',
      '',
      'Chart payload:',
      JSON.stringify(payload, null, 2)
    ].join('\n');
  }

  function buildReviewerRequest(chart, diagnostics = {}) {
    const payload = buildReviewerPayload(chart, diagnostics);
    return {
      payload,
      prompt: buildReviewerPrompt(payload)
    };
  }

  async function requestReview(apiBase, chart, diagnostics = {}) {
    const request = buildReviewerRequest(chart, diagnostics);
    const base = String(apiBase || '').replace(/\/$/, '');
    const fetchImpl = (typeof fetch === 'function' && fetch)
      || (typeof window !== 'undefined' && typeof window.fetch === 'function' && window.fetch.bind(window))
      || (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function' && globalThis.fetch.bind(globalThis));
    if (!fetchImpl) throw new Error('fetch is not available');
    const response = await fetchImpl(`${base}/api/chart-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `chart review failed (${response.status})`);
    }
    return response.json();
  }

  const api = { buildReviewerPayload, buildReviewerPrompt, buildReviewerRequest, requestReview };
  if (typeof window !== 'undefined') window.ChartReviewer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
