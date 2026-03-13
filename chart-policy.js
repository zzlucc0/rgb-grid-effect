(function () {
  function legacyToModern(type, note = {}) {
    const value = String(type || note?.mechanic || note?.type || note?.noteType || 'tap');
    if (value === 'spin') return { mechanic: 'spin', pathVariant: null };
    if (value === 'drag') return { mechanic: 'drag', pathVariant: note.pathVariant || note.pathTemplate || 'arc' };
    if (value === 'ribbon') return { mechanic: 'drag', pathVariant: note.pathVariant || note.pathTemplate || 'starTrace' };
    if (value === 'pulseHold' || value === 'hold') return { mechanic: 'hold', pathVariant: null };
    if (value === 'flick' || value === 'cut' || value === 'gate') return { mechanic: 'tap', pathVariant: null };
    return { mechanic: 'tap', pathVariant: null };
  }

  function stripComplexPath(note) {
    if (!note) return note;
    delete note.endX; delete note.endY; delete note.controlX; delete note.controlY; delete note.extraPath;
    note.keyboardCheckpoint = false;
    note.keyboardHint = null;
    note.pathVariant = null;
    note.pathTemplate = null;
    return note;
  }

  function normalizeNoteSchema(note) {
    if (!note) return note;
    const proposal = legacyToModern(note.proposalMechanic || note.proposalType || note.type || note.noteType, note);
    const current = legacyToModern(note.mechanic || note.type || note.noteType, note);
    note.proposalMechanic = proposal.mechanic;
    note.proposalType = proposal.mechanic;
    note.mechanic = current.mechanic;
    note.type = current.mechanic;
    note.noteType = current.mechanic;
    note.pathVariant = note.pathVariant || current.pathVariant || proposal.pathVariant || (note.mechanic === 'drag' ? 'arc' : null);
    note.pathTemplate = note.pathTemplate || note.pathVariant || null;
    note.keyHint = note.keyHint || null;
    note.keyboardKey = note.keyboardKey || (note.keyHint ? String(note.keyHint).toLowerCase() : null);
    if (!note.inputChannel) note.inputChannel = (note.mechanic === 'drag' || note.mechanic === 'spin') ? 'mouse' : 'shared';
    note.proposalInputChannel = note.proposalInputChannel || note.inputChannel;
    note.exclusivity = note.exclusivity || (note.mechanic === 'spin' ? 'solo-mouse' : 'normal');
    note.keyboardCheckpoint = false;
    note.keyboardHint = null;
    return note;
  }

  function isSustainedType(type) {
    return ['hold', 'drag', 'spin'].includes(String(type || 'tap'));
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
    const calmWindowSec = Number(options.openingCalmWindowSec || 2.6);
    const heavyStartSec = Number(options.openingHeavyStartSec || 5.2);
    const previewBoostSec = Number(options.openingPreviewBoostSec || 0.9);
    const normalized = Math.max(0, Math.min(1, Number(timeSec || 0) / Math.max(0.001, openingSeconds)));
    return {
      inOpening: Number(timeSec || 0) <= openingSeconds,
      inCalmWindow: Number(timeSec || 0) <= calmWindowSec,
      beforeHeavyStart: Number(timeSec || 0) <= heavyStartSec,
      previewBoostSec: previewBoostSec * (1.1 - normalized * 0.5),
      localDensityCap: Number(timeSec || 0) <= calmWindowSec ? 2 : (Number(timeSec || 0) <= heavyStartSec ? 3 : 4)
    };
  }

  function assignMechanics(notes, options = {}) {
    if (!Array.isArray(notes) || !notes.length) return notes || [];
    const seq = [...notes].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    let lastDragTime = -Infinity;
    let spinCount = 0;
    for (let i = 0; i < seq.length; i += 1) {
      const note = seq[i];
      normalizeNoteSchema(note);
      const t = Number(note.time || 0);
      const seg = note.segmentLabel || 'verse';
      const proposal = note.proposalMechanic || 'tap';
      const p = openingPressureProfile(t, options);
      let mechanic = 'tap';
      if (proposal === 'spin' && spinCount < 2 && !p.inOpening) {
        mechanic = 'spin';
        spinCount += 1;
      } else if (proposal === 'drag') {
        const minGap = p.beforeHeavyStart ? 1.8 : 1.35;
        mechanic = t - lastDragTime >= minGap ? 'drag' : 'tap';
      } else if (proposal === 'hold') {
        mechanic = 'hold';
      } else if (proposal === 'tap') {
        const later = i >= Math.floor(seq.length * 0.55);
        const chorusBoost = seg === 'chorus' || seg === 'bridge';
        const holdChance = later ? 0.18 : 0.1;
        const dragChance = (!p.beforeHeavyStart && chorusBoost) ? 0.14 : 0.04;
        const roll = stableUnit(note, i + 17);
        if (roll < dragChance && t - lastDragTime > 1.5) mechanic = 'drag';
        else if (roll < dragChance + holdChance) mechanic = 'hold';
      }
      if (p.inCalmWindow && mechanic === 'drag') mechanic = 'tap';
      note.mechanic = mechanic;
      note.type = mechanic;
      note.noteType = mechanic;
      if (mechanic === 'drag') {
        lastDragTime = t;
        note.pathVariant = note.pathVariant || note.pathTemplate || (seg === 'chorus' ? 'starTrace' : (seg === 'bridge' ? 'diamondLoop' : 'arc'));
        note.pathTemplate = note.pathVariant;
      } else {
        stripComplexPath(note);
      }
      if (mechanic === 'spin') {
        note.pathVariant = null;
        note.pathTemplate = null;
        note.inputChannel = 'mouse';
        note.exclusivity = 'solo-mouse';
      }
    }
    return seq;
  }

  function keyboardLayoutForDifficulty(difficulty = 'normal') {
    if (difficulty === 'easy') return ['F', 'J'];
    if (difficulty === 'hard') return ['A', 'S', 'D', 'J', 'K', 'L'];
    return ['F', 'G', 'H', 'J'];
  }

  function layerABaseChartProposal(notes) {
    return [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0)).map(note => normalizeNoteSchema({ ...note }));
  }

  function layerBMechanicPlanner(notes, options = {}) {
    return assignMechanics(notes, options);
  }

  function layerCInputChannelPlanner(notes, options = {}) {
    const difficulty = options.difficulty || 'normal';
    const keyset = keyboardLayoutForDifficulty(difficulty);
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const total = seq.length || 1;
    seq.forEach((note, idx) => {
      const progress = idx / total;
      const mechanic = note.mechanic || note.type || note.noteType || 'tap';
      const key = keyset[Math.abs(Number(note.laneHint || idx)) % keyset.length] || null;
      note.keyHint = key;
      note.keyboardKey = key ? String(key).toLowerCase() : null;
      if (mechanic === 'drag' || mechanic === 'spin') {
        note.inputChannel = 'mouse';
        note.keyHint = null;
        note.keyboardKey = null;
        note.exclusivity = mechanic === 'spin' ? 'solo-mouse' : 'normal';
        return;
      }
      if (mechanic === 'hold') {
        note.inputChannel = progress < 0.42 ? ((idx % 4 === 0 || idx % 4 === 1) ? 'keyboard' : 'mouse') : ((idx + Math.round(Number(note.phrase || 0))) % 2 === 0 ? 'keyboard' : 'mouse');
        note.exclusivity = 'normal';
        return;
      }
      if (progress < 0.35) note.inputChannel = idx % 2 === 0 ? 'keyboard' : 'mouse';
      else if (progress < 0.7) note.inputChannel = idx % 3 === 0 ? 'shared' : ((idx % 2 === 0) ? 'keyboard' : 'mouse');
      else note.inputChannel = idx % 2 === 0 ? 'shared' : ((idx + 1) % 3 === 0 ? 'mouse' : 'keyboard');
      note.exclusivity = 'normal';
    });
    return seq;
  }

  function applyMousePlayabilityFilter(notes, options = {}) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const dragCooldown = Number(options.sustainedCooldownSec || 1.5);
    const holdCooldown = Number(options.holdCooldownSec || 1.2);
    const spinRadius = Number(options.spinIsolationSec || 2.4);
    let lastDragTime = -Infinity;
    let lastHoldTime = -Infinity;
    for (const note of seq) {
      const type = note.type || note.noteType || 'tap';
      const t = Number(note.time || 0);
      if (type === 'spin') continue;
      const nearbySpin = seq.some(other => other !== note && (other.type || other.noteType) === 'spin' && Math.abs(Number(other.time || 0) - t) < spinRadius);
      if (nearbySpin) {
        note.type = 'tap';
        note.noteType = 'tap';
        note.mechanic = 'tap';
        stripComplexPath(note);
        continue;
      }
      if (type === 'drag') {
        if (t - lastDragTime < dragCooldown) {
          note.type = 'tap'; note.noteType = 'tap'; note.mechanic = 'tap'; stripComplexPath(note); continue;
        }
        lastDragTime = t;
      }
      if (type === 'hold') {
        if (t - lastHoldTime < holdCooldown) {
          note.type = 'tap'; note.noteType = 'tap'; note.mechanic = 'tap'; continue;
        }
        lastHoldTime = t;
      }
    }
    return seq;
  }

  function applyOpeningWindowPolicy(notes, options = {}) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const firstHalfWindowSec = Number(options.firstHalfWindowSec || 30);
    const firstHalfDragRatioCap = Number(options.firstHalfSustainRatioCap || 0.28);
    let lastOpeningDrag = -Infinity;
    for (let i = 0; i < seq.length; i += 1) {
      const note = seq[i];
      const t = Number(note.time || 0);
      const profile = openingPressureProfile(t, options);
      note.spawnLeadBiasSec = Math.max(Number(note.spawnLeadBiasSec || 0), profile.inOpening ? profile.previewBoostSec : 0);
      note.openingCalmWindow = profile.inCalmWindow;
      if (!profile.inOpening) continue;
      if (note.type === 'spin') {
        note.type = 'tap'; note.noteType = 'tap'; note.mechanic = 'tap'; continue;
      }
      if (profile.inCalmWindow && note.type !== 'tap') {
        if (note.type === 'hold' && note.inputChannel === 'keyboard') {
          note.spawnLeadBiasSec = Math.max(Number(note.spawnLeadBiasSec || 0), 1.1);
          continue;
        }
        note.type = 'tap'; note.noteType = 'tap'; note.mechanic = 'tap'; stripComplexPath(note); continue;
      }
      if (note.type === 'drag') {
        if (t - lastOpeningDrag < 1.8) {
          note.type = 'tap'; note.noteType = 'tap'; note.mechanic = 'tap'; stripComplexPath(note); continue;
        }
        note.minCompletionWindowSec = Number(options.openingDragCompletionWindowSec || 1.35);
        lastOpeningDrag = t;
      }
    }
    const firstHalf = seq.filter(n => Number(n.time || 0) <= firstHalfWindowSec);
    const drags = firstHalf.filter(n => (n.type || n.noteType) === 'drag');
    while (firstHalf.length && drags.length / firstHalf.length > firstHalfDragRatioCap) {
      const candidate = drags.pop();
      if (!candidate) break;
      candidate.type = 'tap'; candidate.noteType = 'tap'; candidate.mechanic = 'tap'; stripComplexPath(candidate);
    }
    return seq;
  }

  function downgradeType(type) {
    const modern = legacyToModern(type).mechanic;
    if (modern === 'spin') return 'drag';
    if (modern === 'drag') return 'hold';
    if (modern === 'hold') return 'tap';
    return 'tap';
  }

  function enforceChartPlayability(notes) {
    if (!Array.isArray(notes) || !notes.length) return notes || [];
    for (let i = 0; i < notes.length; i += 1) {
      const note = notes[i];
      const type = note.type || note.noteType || 'tap';
      const lane = Number.isFinite(note.laneHint) ? Number(note.laneHint) : 0;
      for (let j = i + 1; j < notes.length; j += 1) {
        const next = notes[j];
        const dt = Number(next.time || 0) - Number(note.time || 0);
        if (dt > 2.5) break;
        const nextType = next.type || next.noteType || 'tap';
        const nextLane = Number.isFinite(next.laneHint) ? Number(next.laneHint) : lane;
        const laneClose = Math.abs(nextLane - lane) <= 1;
        if (type === 'spin' && dt < 2.4) {
          next.type = 'tap'; next.noteType = 'tap'; next.mechanic = 'tap'; stripComplexPath(next);
          continue;
        }
        if (type === 'drag' && nextType === 'drag' && dt < 1.2) {
          next.type = 'tap'; next.noteType = 'tap'; next.mechanic = 'tap'; stripComplexPath(next);
        }
        if (type === 'hold' && nextType === 'hold' && dt < 0.9 && laneClose) {
          next.type = 'tap'; next.noteType = 'tap'; next.mechanic = 'tap';
        }
      }
    }
    return notes;
  }

  function tutorialLabelForType(type, note = null) {
    const modern = legacyToModern(type, note || {}).mechanic;
    if (modern === 'drag') return 'DRAG';
    if (modern === 'hold') return note?.inputChannel === 'keyboard' ? 'KEY HOLD' : 'HOLD';
    if (modern === 'spin') return 'SPIN';
    return 'TAP';
  }

  function assignKeyboardCheckpoints(notes) {
    return [...(notes || [])].map(note => {
      note.keyboardCheckpoint = false;
      note.keyboardHint = null;
      note.keyboardHit = false;
      return note;
    });
  }

  function noteRadius(note, circleSize = 36) {
    const type = note?.type || note?.noteType || 'tap';
    if (type === 'spin') return circleSize * 1.8;
    if (type === 'hold') return circleSize * 1.45;
    if (type === 'drag') return circleSize * 1.05;
    return circleSize * 0.95;
  }

  function linePointDistance(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const ab2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
    const cx = ax + abx * t, cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy);
  }

  function makeFootprint(note, circleSize = 36) {
    const radius = noteRadius(note, circleSize);
    const fp = { center: { x: note.x, y: note.y, r: radius }, endpoint: null, path: null };
    if (Number.isFinite(note?.endX) && Number.isFinite(note?.endY)) {
      fp.endpoint = { x: note.endX, y: note.endY, r: radius * 0.88 };
      fp.path = { ax: note.x, ay: note.y, bx: note.endX, by: note.endY, r: radius * (note?.pathVariant === 'starTrace' ? 0.95 : 0.72) };
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
    if (type === 'spin') return 7;
    if (type === 'drag') return 5;
    if (type === 'hold') return 3;
    return 1;
  }

  function auditFootprints(notes, circleSize = 36) {
    const issues = [];
    const fps = (notes || []).map(note => ({ note, fp: makeFootprint(note, circleSize) }));
    for (let i = 0; i < fps.length; i += 1) {
      for (let j = i + 1; j < fps.length; j += 1) {
        if (footprintsOverlap(fps[i].fp, fps[j].fp)) issues.push({ a: fps[i].note, b: fps[j].note, severity: footprintSeverity(fps[i].note) + footprintSeverity(fps[j].note) });
      }
    }
    return issues.sort((a, b) => b.severity - a.severity);
  }

  function sortByLayoutPriority(notes) {
    return [...(notes || [])].sort((a, b) => footprintSeverity(b) - footprintSeverity(a));
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
      if ((note.type || note.noteType) === 'drag') {
        note.pathVariant = note.pathVariant === 'starTrace' ? 'diamondLoop' : 'arc';
        note.pathTemplate = note.pathVariant;
      } else if ((note.type || note.noteType) === 'spin') {
        note.type = 'tap'; note.noteType = 'tap'; note.mechanic = 'tap';
      } else {
        note.type = 'tap'; note.noteType = 'tap'; note.mechanic = 'tap';
      }
      kept.push(note);
    }
    return kept;
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
    return { tapRatio: tapCount / total, latterSpecial, latterTotal: latter.length || 1, latterSpecialRatio: latterSpecial / (latter.length || 1) };
  }

  function spatialFlowStats(notes) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    if (seq.length <= 1) return { transitions: 0, avgLaneJump: 0, maxLaneJump: 0, largeJumpCount: 0, directionReversalCount: 0, centerBiasRatio: 0 };
    let totalJump = 0, maxLaneJump = 0, largeJumpCount = 0, directionReversalCount = 0, centerBiasHits = 0, prevDelta = 0;
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
    return { transitions: seq.length - 1, avgLaneJump: totalJump / Math.max(1, seq.length - 1), maxLaneJump, largeJumpCount, directionReversalCount, centerBiasRatio: centerBiasHits / Math.max(1, seq.length - 1) };
  }

  function geometryTemplateStats(notes) {
    const seq = [...(notes || [])];
    const eligible = seq.filter(n => (n.type || n.noteType || 'tap') === 'drag');
    const templates = eligible.map(n => n.pathTemplate || n.pathVariant).filter(Boolean);
    const geometry = templates.filter(name => name !== 'arc' && name !== 'orbit');
    const diamondLoopCount = geometry.filter(name => name === 'diamondLoop').length;
    const starTraceCount = geometry.filter(name => name === 'starTrace').length;
    const runtimeGeometryVisible = eligible.filter(n => ['diamondLoop', 'starTrace'].includes(n.pathTemplate || n.pathVariant) && (n.extraPath?.points?.length || true)).length;
    return { eligibleCount: eligible.length, templatedCount: templates.length, geometryCount: geometry.length, orbitCount: templates.filter(name => name === 'orbit' || name === 'arc').length, diamondLoopCount, starTraceCount, geometryRatio: geometry.length / Math.max(1, eligible.length), runtimeVisibleRatio: runtimeGeometryVisible / Math.max(1, geometry.length) };
  }

  function enforceDensityFloor(notes, options = {}) {
    const minFirst30 = Number(options.minFirst30 || 12);
    const minPer10 = Number(options.minPer10 || 3);
    const maxTapRatio = Number(options.maxTapRatio || 0.58);
    const minLatterSpecialRatio = Number(options.minLatterSpecialRatio || 0.22);
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const stats = densityStats(seq, 10, 30);
    if (stats.first30 < minFirst30 || stats.minWindowCount < minPer10) return seq;
    if (mechanicMixStats(seq).tapRatio > maxTapRatio) {
      for (const note of seq) {
        if ((note.type || note.noteType) !== 'tap') continue;
        if (Number(note.time || 0) < 10) continue;
        note.type = (note.segmentLabel === 'chorus' || note.segmentLabel === 'bridge') ? 'drag' : 'hold';
        note.noteType = note.type;
        note.mechanic = note.type;
        if (note.type === 'drag') {
          note.pathVariant = note.pathVariant || (note.segmentLabel === 'chorus' ? 'starTrace' : 'diamondLoop');
          note.pathTemplate = note.pathVariant;
        }
        if (mechanicMixStats(seq).tapRatio <= maxTapRatio) break;
      }
    }
    if (mechanicMixStats(seq).latterSpecialRatio < minLatterSpecialRatio) {
      const latter = seq.filter((_, idx) => idx >= Math.floor(seq.length * 0.5));
      for (const note of latter) {
        if ((note.type || note.noteType) !== 'tap') continue;
        note.type = note.segmentLabel === 'chorus' ? 'drag' : 'hold';
        note.noteType = note.type;
        note.mechanic = note.type;
        if (note.type === 'drag') {
          note.pathVariant = note.pathVariant || (note.segmentLabel === 'chorus' ? 'starTrace' : 'diamondLoop');
          note.pathTemplate = note.pathVariant;
        }
        if (mechanicMixStats(seq).latterSpecialRatio >= minLatterSpecialRatio) break;
      }
    }
    return seq;
  }

  function enforceSpinPlacement(notes) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const spins = seq.filter(n => (n.type || n.noteType) === 'spin');
    while (spins.length > 2) {
      const victim = spins.pop();
      victim.type = 'tap'; victim.noteType = 'tap'; victim.mechanic = 'tap';
    }
    return seq;
  }

  function layerDOpeningGuard(notes, options = {}) {
    return applyOpeningWindowPolicy(applyMousePlayabilityFilter(notes, options), options);
  }

  function layerEPlayabilityGuard(notes, options = {}) {
    return resolvePathConflicts(enforceChartPlayability(enforceSpinPlacement(notes)), Number(options.circleSize || 36));
  }

  function layerFGeometryPrep(notes, options = {}) {
    const seq = assignKeyboardCheckpoints(notes, options);
    let dragCount = 0;
    let nonArcCount = 0;
    const difficulty = options.difficulty || 'normal';
    for (const note of seq) {
      if ((note.type || note.noteType) !== 'drag') continue;
      dragCount += 1;
      if (!note.pathVariant || note.pathVariant === 'orbit') note.pathVariant = 'arc';
      if (difficulty !== 'easy' && (nonArcCount < 2 || (dragCount >= 3 && stableUnit(note, dragCount) > 0.34))) {
        note.pathVariant = note.pathVariant === 'arc' ? (dragCount % 2 === 0 ? 'diamondLoop' : 'starTrace') : note.pathVariant;
      }
      if (note.pathVariant !== 'arc') nonArcCount += 1;
      note.pathTemplate = note.pathVariant;
    }
    return seq;
  }

  function layerGRuntimeAudit(notes, options = {}) {
    const seq = enforceDensityFloor(notes, options);
    return { notes: seq, audit: auditChartShape(seq) };
  }

  function spreadQuotaPromotions(notes) { return layerBMechanicPlanner(notes); }

  function auditChartShape(notes) {
    return { mechanic: mechanicMixStats(notes), spatial: spatialFlowStats(notes), geometry: geometryTemplateStats(notes) };
  }

  function finalizePlayableChartPipeline(notes, options = {}) {
    let seq = layerABaseChartProposal(notes || []);
    seq = layerBMechanicPlanner(seq, options);
    seq = layerCInputChannelPlanner(seq, options);
    seq = layerDOpeningGuard(seq, options);
    seq = layerEPlayabilityGuard(seq, options);
    seq = layerFGeometryPrep(seq, options);
    const result = layerGRuntimeAudit(seq, options);
    return [...result.notes].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
  }

  const api = { spreadQuotaPromotions, assignMechanics, applyMousePlayabilityFilter, applyOpeningWindowPolicy, enforceChartPlayability, tutorialLabelForType, assignKeyboardCheckpoints, makeFootprint, footprintsOverlap, auditFootprints, sortByLayoutPriority, footprintSeverity, resolvePathConflicts, finalizePlayableChartPipeline, densityStats, enforceDensityFloor, mechanicMixStats, spatialFlowStats, geometryTemplateStats, auditChartShape, keyboardLayoutForDifficulty, layerABaseChartProposal, layerBMechanicPlanner, layerCInputChannelPlanner, layerDOpeningGuard, layerEPlayabilityGuard, layerFGeometryPrep, layerGRuntimeAudit, downgradeType, isSustainedType, normalizeNoteSchema, stripComplexPath };
  if (typeof window !== 'undefined') window.ChartPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
