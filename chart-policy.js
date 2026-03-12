(function () {
  function spreadQuotaPromotions(notes) {
    if (!Array.isArray(notes) || !notes.length) return notes || [];
    const quotaPlan = {
      full: { ribbon: 8, cut: 10, flick: 14, gate: 8, pulseHold: 10, drag: 12 },
      chorus: { ribbon: 3, cut: 3, flick: 2, gate: 2 },
      verse: { pulseHold: 2, flick: 2, drag: 2, gate: 1 },
      bridge: { gate: 3, pulseHold: 2, flick: 2, cut: 1 },
      intro: { flick: 1, drag: 1 }
    };
    const replaceable = new Set(['tap', 'drag']);
    const countType = (entries, type) => entries.filter(entry => (entry.note.type || entry.note.noteType) === type).length;
    const evenlyPromote = (entries, targetType, target, allow) => {
      const current = countType(entries, targetType);
      if (current >= target) return;
      const candidates = entries.filter(entry => replaceable.has(entry.note.type || entry.note.noteType || 'tap') && (!allow || allow(entry.note, entry.idx)));
      if (!candidates.length) return;
      const need = target - current;
      const step = Math.max(1, Math.floor(candidates.length / need));
      let cursor = Math.floor(step / 2);
      let applied = 0;
      const used = new Set();
      while (applied < need && used.size < candidates.length) {
        const idx = Math.min(candidates.length - 1, cursor);
        let pick = idx;
        while (used.has(pick) && pick < candidates.length - 1) pick += 1;
        if (used.has(pick)) break;
        used.add(pick);
        candidates[pick].note.type = targetType;
        applied += 1;
        cursor += step;
      }
    };
    const applyPlan = (entries, plan, allowMap = {}) => {
      for (const [type, target] of Object.entries(plan || {})) {
        evenlyPromote(entries, type, target, allowMap[type]);
      }
    };
    const allEntries = notes.map((note, idx) => ({ note, idx }));
    applyPlan(allEntries, quotaPlan.full, {
      ribbon: (note) => (note.segmentLabel || 'verse') === 'chorus',
      cut: (note) => ['chorus', 'bridge'].includes(note.segmentLabel || 'verse'),
      gate: (note) => ['chorus', 'bridge', 'verse'].includes(note.segmentLabel || 'verse'),
      pulseHold: (note) => (note.segmentLabel || 'verse') !== 'chorus',
      flick: () => true,
      drag: () => true
    });
    const bySegment = new Map();
    notes.forEach((note, idx) => {
      const seg = note.segmentLabel || 'verse';
      if (!bySegment.has(seg)) bySegment.set(seg, []);
      bySegment.get(seg).push({ note, idx });
    });
    for (const [seg, entries] of bySegment.entries()) {
      applyPlan(entries, quotaPlan[seg] || quotaPlan.verse);
    }
    return notes;
  }

  function enforceChartPlayability(notes) {
    if (!Array.isArray(notes) || !notes.length) return notes || [];
    const sustained = new Set(['pulseHold', 'drag', 'ribbon']);
    const heavyTap = new Set(['flick', 'cut', 'gate']);
    const minGapByType = {
      pulseHold: 1.15,
      ribbon: 1.0,
      drag: 0.8,
      gate: 0.55,
      flick: 0.4,
      cut: 0.45
    };
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const type = note.type || 'tap';
      const lane = Number.isFinite(note.laneHint) ? note.laneHint : (i % 4);
      const minGap = minGapByType[type] || 0.28;
      for (let j = i + 1; j < notes.length; j++) {
        const next = notes[j];
        const dt = Number(next.time || 0) - Number(note.time || 0);
        if (dt > Math.max(1.4, minGap + 0.25)) break;
        const nextType = next.type || 'tap';
        const nextLane = Number.isFinite(next.laneHint) ? next.laneHint : (j % 4);
        const laneClose = Math.abs(nextLane - lane) <= 1;
        if (sustained.has(type) && heavyTap.has(nextType) && dt < minGap && laneClose) {
          next.type = 'tap';
        }
        if (sustained.has(type) && sustained.has(nextType) && dt < minGap + 0.15) {
          next.type = nextType === 'ribbon' ? 'drag' : 'tap';
        }
        if ((type === 'gate' || nextType === 'gate') && laneClose && dt < 0.48) {
          next.type = 'tap';
        }
        if (dt < 0.24 && laneClose) {
          next.laneHint = (lane + 2 + (j % 2)) % 4;
        }
      }
    }
    return notes;
  }

  function tutorialLabelForType(type) {
    const map = {
      tap: 'TAP',
      drag: 'DRAG',
      ribbon: 'TRACE',
      pulseHold: 'HOLD',
      gate: 'PASS',
      flick: 'FLICK',
      cut: 'SLASH'
    };
    return map[type] || String(type || 'TAP').toUpperCase();
  }

  const api = { spreadQuotaPromotions, enforceChartPlayability, tutorialLabelForType };
  if (typeof window !== 'undefined') window.ChartPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
