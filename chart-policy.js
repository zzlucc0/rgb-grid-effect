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

  function stableUnit(note, salt = 0) {
    const t = Math.round(Number(note?.time || 0) * 1000);
    const lane = Math.round(Number(note?.laneHint || 0));
    const phrase = Math.round(Number(note?.phrase || note?.groupIndex || 0));
    let x = (t + 101 * (lane + 3) + 271 * (phrase + 7) + 907 * (salt + 11)) >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return (x % 10000) / 10000;
  }

  function openingPressureProfile(timeSec, options = {}) {
    const openingSeconds = Number(options.openingSeconds || 12);
    const calmWindowSec = Number(options.openingCalmWindowSec || 2.4);
    const heavyStartSec = Number(options.openingHeavyStartSec || 4.8);
    const previewBoostSec = Number(options.openingPreviewBoostSec || 0.9);
    const normalized = Math.max(0, Math.min(1, Number(timeSec || 0) / Math.max(0.001, openingSeconds)));
    return {
      inOpening: Number(timeSec || 0) <= openingSeconds,
      inCalmWindow: Number(timeSec || 0) <= calmWindowSec,
      beforeHeavyStart: Number(timeSec || 0) <= heavyStartSec,
      previewBoostSec: previewBoostSec * (1.1 - normalized * 0.55),
      localDensityCap: Number(timeSec || 0) <= calmWindowSec ? 2 : (Number(timeSec || 0) <= heavyStartSec ? 3 : 4)
    };
  }

  function applyOpeningWindowPolicy(notes, options = {}) {
    const seq = [...(notes || [])].sort((a,b)=>Number(a.time||0)-Number(b.time||0));
    const calmWindowSec = Number(options.openingCalmWindowSec || 2.4);
    const heavyStartSec = Number(options.openingHeavyStartSec || 4.8);
    let sustainedUsed = 0;
    let holdUsed = 0;
      for (let i = 0; i < seq.length; i++) {
      const note = seq[i];
      const t = Number(note.time || 0);
      const profile = openingPressureProfile(t, options);
      note.spawnLeadBiasSec = Math.max(Number(note.spawnLeadBiasSec || 0), profile.inOpening ? profile.previewBoostSec : 0);
      note.openingCalmWindow = profile.inCalmWindow;
      note.openingSequence = i;
      const type = note.type || note.noteType || 'tap';
      if (!profile.inOpening) continue;
      const localWindow = seq.filter(other => Math.abs(Number(other.time || 0) - t) <= 1.35).length;
      if (profile.inCalmWindow && localWindow > profile.localDensityCap && (type !== 'tap' && type !== 'flick')) {
        note.type = 'tap';
        note.noteType = 'tap';
        stripComplexPath(note);
        continue;
      }
      if (t <= heavyStartSec && ['ribbon', 'pulseHold', 'gate'].includes(type)) {
        note.type = type === 'gate' ? 'flick' : 'drag';
        note.noteType = note.type;
        if (note.noteType !== 'drag') stripComplexPath(note);
      }
      const effectiveType = note.type || note.noteType || type;
      if (!isSustainedType(effectiveType)) continue;
      sustainedUsed += 1;
      if (effectiveType === 'pulseHold') holdUsed += 1;
      if (t <= calmWindowSec && effectiveType !== 'drag') {
        note.type = 'drag';
        note.noteType = 'drag';
        continue;
      }
      if (holdUsed > 1 || sustainedUsed > (t <= heavyStartSec ? 3 : 4)) {
        note.type = t <= heavyStartSec ? 'drag' : 'tap';
        note.noteType = note.type;
        if (note.noteType === 'tap') stripComplexPath(note);
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

  function assignMechanics(notes, options = {}) {
    if (!Array.isArray(notes) || !notes.length) return notes || [];
    const seq = [...notes].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const windowCounts = [];
    const familyOf = (type) => {
      if (['drag', 'ribbon', 'pulseHold'].includes(type)) return 'sustain';
      if (['gate', 'cut', 'flick'].includes(type)) return 'accent';
      return 'tap';
    };
    const segmentWeights = (segment = 'verse') => {
      const varietyBoost = Number(options.varietyBoost || 0);
      const tapPenaltyBoost = Number(options.tapPenaltyBoost || 0);
      if (segment === 'chorus') return { tap: 0.18 - tapPenaltyBoost * 0.06, drag: 0.24, ribbon: 0.18 + varietyBoost * 0.1, pulseHold: 0.12, flick: 0.11, cut: 0.1 + varietyBoost * 0.05, gate: 0.07 };
      if (segment === 'bridge') return { tap: 0.24 - tapPenaltyBoost * 0.05, drag: 0.17, ribbon: 0.08 + varietyBoost * 0.04, pulseHold: 0.2 + varietyBoost * 0.06, flick: 0.1, cut: 0.06, gate: 0.15 + varietyBoost * 0.04 };
      if (segment === 'intro') return { tap: 0.52 - tapPenaltyBoost * 0.03, drag: 0.26, ribbon: 0.02, pulseHold: 0.07, flick: 0.08 + varietyBoost * 0.03, cut: 0.03, gate: 0.02 };
      return { tap: 0.3 - tapPenaltyBoost * 0.05, drag: 0.24 + varietyBoost * 0.04, ribbon: 0.08 + varietyBoost * 0.05, pulseHold: 0.16 + varietyBoost * 0.04, flick: 0.1, cut: 0.06 + varietyBoost * 0.03, gate: 0.06 };
    };
    const candidatesFor = (segment = 'verse', t = 0) => {
      const p = openingPressureProfile(t, options);
      if (p.inCalmWindow) return ['tap', 'drag', 'flick'];
      if (p.beforeHeavyStart) return segment === 'chorus' ? ['tap', 'drag', 'flick', 'cut'] : ['tap', 'drag', 'flick', 'pulseHold'];
      if (segment === 'chorus') return ['tap', 'drag', 'ribbon', 'flick', 'cut', 'gate'];
      if (segment === 'bridge') return ['tap', 'drag', 'pulseHold', 'gate', 'flick'];
      return ['tap', 'drag', 'pulseHold', 'flick', 'cut'];
    };
    const recentFamilyRun = (idx, fam) => {
      let run = 0;
      for (let i = idx - 1; i >= 0; i -= 1) {
        const prevType = seq[i].type || seq[i].noteType || 'tap';
        if (familyOf(prevType) !== fam) break;
        run += 1;
      }
      return run;
    };
    const recentTypeRun = (idx, type) => {
      let run = 0;
      for (let i = idx - 1; i >= 0; i -= 1) {
        const prevType = seq[i].type || seq[i].noteType || 'tap';
        if (prevType !== type) break;
        run += 1;
      }
      return run;
    };

    for (let i = 0; i < seq.length; i += 1) {
      const note = seq[i];
      const t = Number(note.time || 0);
      const seg = note.segmentLabel || 'verse';
      const profile = openingPressureProfile(t, options);
      const candidates = candidatesFor(seg, t);
      const weights = segmentWeights(seg);
      let bestType = 'tap';
      let bestScore = -Infinity;
      const recent = seq.slice(Math.max(0, i - 6), i);
      const recentTypes = recent.map(n => n.type || n.noteType || 'tap');
      const counts = recentTypes.reduce((acc, type) => { acc[type] = (acc[type] || 0) + 1; return acc; }, {});

      for (const type of candidates) {
        let score = (weights[type] || 0.05) * 10;
        const fam = familyOf(type);
        const familyRun = recentFamilyRun(i, fam);
        const typeRun = recentTypeRun(i, type);
        score -= familyRun >= 2 ? 3.4 + familyRun * 1.25 : 0;
        score -= typeRun >= 1 ? 1.6 * typeRun : 0;
        score -= (counts[type] || 0) * 0.95;
        if (profile.inCalmWindow && fam === 'sustain' && type !== 'drag') score -= 4.2;
        if (profile.beforeHeavyStart && ['ribbon', 'gate', 'pulseHold'].includes(type)) score -= 2.8;
        if (seg === 'chorus' && ['ribbon', 'cut', 'drag'].includes(type)) score += 1.15;
        if (seg === 'bridge' && ['pulseHold', 'gate'].includes(type)) score += 1.05;
        if (seg === 'intro' && type === 'tap') score += 1.25;
        const phrasePos = i % 6;
        if (phrasePos === 0 && ['drag', 'pulseHold'].includes(type)) score += 0.8;
        if (phrasePos >= 4 && ['cut', 'flick', 'gate'].includes(type)) score += 0.65;
        if (i >= Math.floor(seq.length * 0.55) && type !== 'tap') score += 0.45;
        score += stableUnit(note, i + type.length) * 1.35;
        if (score > bestScore) {
          bestScore = score;
          bestType = type;
        }
      }

      note.type = bestType;
      note.noteType = bestType;
      windowCounts.push(bestType);
    }

    return seq;
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

  function spatialFlowStats(notes) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    if (seq.length <= 1) {
      return { transitions: 0, avgLaneJump: 0, maxLaneJump: 0, largeJumpCount: 0, directionReversalCount: 0, centerBiasRatio: 0 };
    }
    let totalJump = 0;
    let maxLaneJump = 0;
    let largeJumpCount = 0;
    let directionReversalCount = 0;
    let centerBiasHits = 0;
    let prevDelta = 0;
    for (let i = 1; i < seq.length; i += 1) {
      const prevLane = Number.isFinite(seq[i - 1].laneFloat) ? Number(seq[i - 1].laneFloat) : Number(seq[i - 1].laneHint || 0);
      const lane = Number.isFinite(seq[i].laneFloat) ? Number(seq[i].laneFloat) : Number(seq[i].laneHint || 0);
      const delta = lane - prevLane;
      const jump = Math.abs(delta);
      totalJump += jump;
      maxLaneJump = Math.max(maxLaneJump, jump);
      if (jump >= 1.5) largeJumpCount += 1;
      if (Math.abs(lane - 1.5) <= 0.75) centerBiasHits += 1;
      if (i > 1 && Math.abs(delta) >= 0.4 && Math.abs(prevDelta) >= 0.4 && Math.sign(delta) !== Math.sign(prevDelta)) directionReversalCount += 1;
      if (Math.abs(delta) >= 0.4) prevDelta = delta;
    }
    return {
      transitions: seq.length - 1,
      avgLaneJump: totalJump / Math.max(1, seq.length - 1),
      maxLaneJump,
      largeJumpCount,
      directionReversalCount,
      centerBiasRatio: centerBiasHits / Math.max(1, seq.length - 1)
    };
  }

  function geometryTemplateStats(notes) {
    const seq = [...(notes || [])];
    const eligible = seq.filter(n => ['drag', 'ribbon'].includes(n.type || n.noteType || 'tap'));
    const templates = eligible.map(n => n.pathTemplate).filter(Boolean);
    const geometry = templates.filter(name => name !== 'orbit');
    const diamondLoopCount = geometry.filter(name => name === 'diamondLoop').length;
    const starTraceCount = geometry.filter(name => name === 'starTrace').length;
    const runtimeGeometryVisible = eligible.filter(n => ['diamondLoop', 'starTrace'].includes(n.pathTemplate) && (n.extraPath?.points?.length || n.keyboardCheckpoint)).length;
    return {
      eligibleCount: eligible.length,
      templatedCount: templates.length,
      geometryCount: geometry.length,
      orbitCount: templates.filter(name => name === 'orbit').length,
      diamondLoopCount,
      starTraceCount,
      geometryRatio: geometry.length / Math.max(1, eligible.length),
      runtimeVisibleRatio: runtimeGeometryVisible / Math.max(1, geometry.length)
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

  function auditChartShape(notes) {
    return {
      mechanic: mechanicMixStats(notes),
      spatial: spatialFlowStats(notes),
      geometry: geometryTemplateStats(notes)
    };
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

  const api = { spreadQuotaPromotions, assignMechanics, applyMousePlayabilityFilter, applyOpeningWindowPolicy, enforceChartPlayability, tutorialLabelForType, assignKeyboardCheckpoints, makeFootprint, footprintsOverlap, auditFootprints, sortByLayoutPriority, footprintSeverity, resolvePathConflicts, finalizePlayableChartPipeline, densityStats, enforceDensityFloor, mechanicMixStats, spatialFlowStats, geometryTemplateStats, auditChartShape, downgradeType, isSustainedType };
  if (typeof window !== 'undefined') window.ChartPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
