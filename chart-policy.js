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

  function noteRadius(note, circleSize = 36) {
    const type = note?.type || note?.noteType || 'tap';
    if (type === 'pulseHold') return circleSize * 1.45;
    if (type === 'gate') return circleSize * 1.3;
    if (type === 'flick' || type === 'cut') return circleSize * 1.05;
    return circleSize * 0.95;
  }

  function linePointDistance(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const ab2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
    const cx = ax + abx * t, cy = ay + aby * t;
    const dx = px - cx, dy = py - cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function makeFootprint(note, circleSize = 36) {
    const radius = noteRadius(note, circleSize);
    const fp = { center: { x: note.x, y: note.y, r: radius }, endpoint: null, path: null };
    if (Number.isFinite(note?.endX) && Number.isFinite(note?.endY)) {
      fp.endpoint = { x: note.endX, y: note.endY, r: radius * 0.9 };
      fp.path = {
        ax: note.x,
        ay: note.y,
        bx: note.endX,
        by: note.endY,
        r: (note?.noteType === 'ribbon' ? radius * 0.9 : radius * 0.65)
      };
    }
    if ((note?.type || note?.noteType) === 'gate') {
      fp.box = { x: note.x, y: note.y, w: note.gateWidth || circleSize * 2.4, h: circleSize * 1.5 };
    }
    return fp;
  }

  function footprintsOverlap(a, b) {
    const cdist = (p, q) => Math.hypot((p.x || 0) - (q.x || 0), (p.y || 0) - (q.y || 0));
    if (cdist(a.center, b.center) < (a.center.r + b.center.r)) return true;
    if (a.endpoint && cdist(a.endpoint, b.center) < (a.endpoint.r + b.center.r)) return true;
    if (b.endpoint && cdist(a.center, b.endpoint) < (a.center.r + b.endpoint.r)) return true;
    if (a.path && linePointDistance(b.center.x, b.center.y, a.path.ax, a.path.ay, a.path.bx, a.path.by) < (a.path.r + b.center.r)) return true;
    if (b.path && linePointDistance(a.center.x, a.center.y, b.path.ax, b.path.ay, b.path.bx, b.path.by) < (b.path.r + a.center.r)) return true;
    return false;
  }

  function footprintSeverity(note) {
    const type = note?.type || note?.noteType || 'tap';
    if (type === 'ribbon') return 6;
    if (type === 'drag') return 5;
    if (type === 'gate') return 4;
    if (type === 'pulseHold') return 3;
    if (type === 'cut' || type === 'flick') return 2;
    return 1;
  }

  function auditFootprints(notes, circleSize = 36) {
    const issues = [];
    const fps = (notes || []).map(note => ({ note, fp: makeFootprint(note, circleSize) }));
    for (let i = 0; i < fps.length; i++) {
      for (let j = i + 1; j < fps.length; j++) {
        if (footprintsOverlap(fps[i].fp, fps[j].fp)) {
          issues.push({ a: fps[i].note, b: fps[j].note, severity: footprintSeverity(fps[i].note) + footprintSeverity(fps[j].note) });
        }
      }
    }
    return issues.sort((a, b) => b.severity - a.severity);
  }

  function sortByLayoutPriority(notes) {
    return [...(notes || [])].sort((a, b) => footprintSeverity(b) - footprintSeverity(a));
  }

  const api = { spreadQuotaPromotions, enforceChartPlayability, tutorialLabelForType, makeFootprint, footprintsOverlap, auditFootprints, sortByLayoutPriority, footprintSeverity };
  if (typeof window !== 'undefined') window.ChartPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
