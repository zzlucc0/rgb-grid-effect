(function () {
  function stripComplexPath(note) {
    if (!note) return note;
    delete note.endX; delete note.endY; delete note.controlX; delete note.controlY; delete note.extraPath;
    note.keyboardCheckpoint = false;
    note.keyboardHint = null;
    return note;
  }

  function isSustainedType(type) {
    return ['pulseHold','drag','ribbon','orbit','diamondLoop','starTrace'].includes(type);
  }

  function applyOpeningWindowPolicy(notes, options = {}) {
    const openingSeconds = Number(options.openingSeconds || 12);
    const seq = [...(notes || [])].sort((a,b)=>Number(a.time||0)-Number(b.time||0));
    let sustainedUsed = 0;
    let holdUsed = 0;
    for (const note of seq) {
      if (Number(note.time || 0) > openingSeconds) break;
      const type = note.type || note.noteType || 'tap';
      if (!isSustainedType(type)) continue;
      sustainedUsed += 1;
      if (type === 'pulseHold') holdUsed += 1;
      if (holdUsed > 1 || sustainedUsed > 3) {
        note.type = 'tap';
        note.noteType = 'tap';
        stripComplexPath(note);
      }
    }
    return seq;
  }

  function applyMousePlayabilityFilter(notes, options = {}) {
    const seq = [...(notes || [])].sort((a,b)=>Number(a.time||0)-Number(b.time||0));
    const sustainedCooldown = Number(options.sustainedCooldownSec || 1.6);
    const holdCooldown = Number(options.holdCooldownSec || 2.6);
    let lastSustainedTime = -Infinity;
    let lastHoldTime = -Infinity;
    for (const note of seq) {
      const type = note.type || note.noteType || 'tap';
      const t = Number(note.time || 0);
      if (!isSustainedType(type)) continue;
      if (type === 'pulseHold') {
        if (t - lastHoldTime < holdCooldown || t - lastSustainedTime < sustainedCooldown) {
          note.type = 'tap';
          note.noteType = 'tap';
          stripComplexPath(note);
          continue;
        }
        lastHoldTime = t;
        lastSustainedTime = t;
        continue;
      }
      if (t - lastSustainedTime < sustainedCooldown) {
        note.type = 'tap';
        note.noteType = 'tap';
        stripComplexPath(note);
        continue;
      }
      lastSustainedTime = t;
    }
    return seq;
  }

  function assignMechanics(notes) {
    if (!Array.isArray(notes) || !notes.length) return notes || [];
    const quotaPlan = {
      full: { ribbon: 11, cut: 8, flick: 8, gate: 6, pulseHold: 12, drag: 18 },
      chorus: { ribbon: 4, cut: 2, flick: 1, gate: 1 },
      verse: { pulseHold: 3, flick: 1, drag: 4, gate: 0 },
      bridge: { gate: 1, pulseHold: 2, flick: 1, cut: 1 },
      intro: { flick: 0, drag: 2 }
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
    const latterHalf = allEntries.filter(entry => entry.idx >= Math.floor(allEntries.length * 0.5));
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
    applyPlan(latterHalf, { flick: 2, pulseHold: 5, gate: 1, drag: 6, ribbon: 4, cut: 2 });
    return notes;
  }

  function spreadQuotaPromotions(notes) {
    return assignMechanics(notes);
  }

  function downgradeType(type) {
    const map = {
      ribbon: 'drag',
      drag: 'pulseHold',
      pulseHold: 'tap',
      gate: 'flick',
      cut: 'flick',
      flick: 'tap'
    };
    return map[type] || 'tap';
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
          next.type = downgradeType(nextType);
          next.noteType = next.type;
        }
        if (sustained.has(type) && sustained.has(nextType) && dt < minGap + 0.15) {
          next.type = downgradeType(nextType);
          next.noteType = next.type;
        }
        if ((type === 'gate' || nextType === 'gate') && laneClose && dt < 0.48) {
          next.type = downgradeType(nextType);
          next.noteType = next.type;
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

  function assignKeyboardCheckpoints(notes, options = {}) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const minGapSec = Number(options.keyboardCheckpointGapSec || 2.2);
    const earlyGraceSec = Number(options.keyboardCheckpointEarlyGraceSec || 10);
    let lastCheckpointTime = -Infinity;

    for (const note of seq) {
      note.keyboardCheckpoint = false;
      note.keyboardKey = null;
      note.keyboardHint = null;
      note.keyboardHit = Boolean(note.keyboardHit);

      const type = note.type || note.noteType || 'tap';
      const template = note.pathTemplate || null;
      const eligible = (type === 'drag' || type === 'ribbon') && template && template !== 'orbit';
      if (!eligible) continue;
      if (Number(note.time || 0) <= earlyGraceSec) continue;

      const nearbyConflict = seq.some(other => {
        if (other === note) return false;
        const otherType = other.type || other.noteType || 'tap';
        if (otherType !== 'pulseHold' && other.keyboardCheckpoint !== true) return false;
        return Math.abs(Number(other.time || 0) - Number(note.time || 0)) < minGapSec;
      });
      if (nearbyConflict) continue;
      if (Number(note.time || 0) - lastCheckpointTime < minGapSec) continue;

      note.keyboardCheckpoint = true;
      note.keyboardKey = 'space';
      note.keyboardHint = 'SPACE';
      note.keyboardHit = false;
      lastCheckpointTime = Number(note.time || 0);
    }

    return seq;
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

  function densityStats(notes, windowSec = 10, horizonSec = 30) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    let minWindowCount = Infinity;
    for (let start = 0; start < horizonSec; start += windowSec) {
      const end = start + windowSec;
      const count = seq.filter(n => Number(n.time || 0) >= start && Number(n.time || 0) < end).length;
      minWindowCount = Math.min(minWindowCount, count);
    }
    const first30 = seq.filter(n => Number(n.time || 0) <= horizonSec).length;
    return { first30, minWindowCount: Number.isFinite(minWindowCount) ? minWindowCount : 0 };
  }

  function mechanicMixStats(notes) {
    const seq = [...(notes || [])];
    const total = seq.length || 1;
    const tapCount = seq.filter(n => (n.type || n.noteType || 'tap') === 'tap').length;
    const latter = seq.filter((_, idx) => idx >= Math.floor(seq.length * 0.5));
    const latterSpecial = latter.filter(n => (n.type || n.noteType || 'tap') !== 'tap').length;
    return {
      tapRatio: tapCount / total,
      latterSpecial,
      latterTotal: latter.length || 1,
      latterSpecialRatio: latterSpecial / (latter.length || 1)
    };
  }

  function enforceDensityFloor(notes, options = {}) {
    const minFirst30 = Number(options.minFirst30 || 12);
    const minPer10 = Number(options.minPer10 || 3);
    const maxTapRatio = Number(options.maxTapRatio || 0.45);
    const minLatterSpecialRatio = Number(options.minLatterSpecialRatio || 0.4);
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const stats = densityStats(seq, 10, 30);
    if (stats.first30 < minFirst30) {
      for (const note of seq) {
        const type = note.type || note.noteType || 'tap';
        if (type === 'ribbon') continue;
        if (type !== 'tap' && type !== 'drag') {
          note.type = 'tap';
          note.noteType = 'tap';
          delete note.endX; delete note.endY; delete note.controlX; delete note.controlY;
        }
      }
    }
    if (stats.minWindowCount < minPer10) {
      let lastTapTime = -Infinity;
      for (const note of seq) {
        if (Number(note.time || 0) > 30) break;
        if (Number(note.time || 0) - lastTapTime >= 1.8) {
          note.type = note.type || 'tap';
          note.noteType = note.noteType || note.type;
          lastTapTime = Number(note.time || 0);
        }
      }
    }
    const mix = mechanicMixStats(seq);
    if (mix.tapRatio > maxTapRatio) {
      for (const note of seq) {
        if ((note.type || note.noteType || 'tap') !== 'tap') continue;
        const seg = note.segmentLabel || 'verse';
        if (seg === 'chorus') note.type = 'drag';
        else if (seg === 'bridge') note.type = 'pulseHold';
        else note.type = 'drag';
        note.noteType = note.type;
        if (mechanicMixStats(seq).tapRatio <= maxTapRatio) break;
      }
    }
    if (mix.latterSpecialRatio < minLatterSpecialRatio) {
      const latter = seq.filter((_, idx) => idx >= Math.floor(seq.length * 0.5));
      for (const note of latter) {
        if ((note.type || note.noteType || 'tap') !== 'tap') continue;
        note.type = (note.segmentLabel || 'verse') === 'chorus' ? 'ribbon' : ((note.segmentLabel || 'verse') === 'bridge' ? 'pulseHold' : 'drag');
        note.noteType = note.type;
        if (mechanicMixStats(seq).latterSpecialRatio >= minLatterSpecialRatio) break;
      }
    }
    return seq;
  }

  function resolvePathConflicts(notes, circleSize = 36) {
    const sorted = sortByLayoutPriority(notes);
    const kept = [];
    for (const note of sorted) {
      const conflicts = auditFootprints([...kept, note], circleSize).filter(issue => issue.a === note || issue.b === note);
      if (!conflicts.length) {
        kept.push(note);
        continue;
      }
      const type = note.type || note.noteType || 'tap';
      const earlyTime = Number(note.time || 0) <= 30;
      if (type === 'ribbon') {
        note.type = 'drag';
        note.noteType = 'drag';
      } else if (type === 'drag' || type === 'gate') {
        note.type = earlyTime ? 'drag' : 'tap';
        note.noteType = note.type;
        if (note.type === 'tap') stripComplexPath(note);
      } else if (type === 'cut' || type === 'flick') {
        note.type = 'tap';
        note.noteType = 'tap';
      }
      kept.push(note);
    }
    return kept;
  }

  function finalizePlayableChartPipeline(notes, options = {}) {
    const circleSize = Number(options.circleSize || 36);
    let seq = assignMechanics(notes || []);
    seq = applyMousePlayabilityFilter(seq, options);
    seq = applyOpeningWindowPolicy(seq, options);
    seq = enforceChartPlayability(seq);
    seq = resolvePathConflicts(seq, circleSize);
    seq = enforceDensityFloor(seq, options);
    seq = assignKeyboardCheckpoints(seq, options);
    return [...seq].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
  }

  const api = { spreadQuotaPromotions, assignMechanics, applyMousePlayabilityFilter, applyOpeningWindowPolicy, enforceChartPlayability, tutorialLabelForType, assignKeyboardCheckpoints, makeFootprint, footprintsOverlap, auditFootprints, sortByLayoutPriority, footprintSeverity, resolvePathConflicts, finalizePlayableChartPipeline, densityStats, enforceDensityFloor, mechanicMixStats, downgradeType, isSustainedType };
  if (typeof window !== 'undefined') window.ChartPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
