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

      // If bar arranger already chose a family, respect it — only allow same or lighter mechanic
      const family = note.arrangedFamily || '';
      if (family) {
        let mechanic = proposal;
        if (family === 'rest' || family === 'single-tap-accent' || family === 'alternating-taps') mechanic = 'tap';
        else if (family === 'hold-anchor') mechanic = proposal === 'hold' ? 'hold' : 'tap';
        else if (family === 'drag-sweep') mechanic = proposal === 'drag' ? 'drag' : (proposal === 'spin' ? 'tap' : 'tap');
        else if (family === 'burst-then-rest') mechanic = proposal === 'drag' ? 'tap' : proposal;
        else if (family === 'sync-accent') mechanic = proposal === 'spin' ? 'spin' : (proposal === 'drag' ? 'drag' : 'tap');
        else mechanic = proposal;

        if (p.inCalmWindow && mechanic === 'drag') mechanic = 'tap';
        if (mechanic === 'spin') { spinCount += 1; if (spinCount > 2) mechanic = 'drag'; }
        if (mechanic === 'drag') {
          const minGap = p.beforeHeavyStart ? 1.8 : 1.35;
          if (t - lastDragTime < minGap) mechanic = 'tap';
          else lastDragTime = t;
        }
        note.mechanic = mechanic;
        note.type = mechanic;
        note.noteType = mechanic;
        if (mechanic === 'drag') {
          note.pathVariant = note.pathVariant || note.pathTemplate || (seg === 'chorus' ? 'starTrace' : (seg === 'bridge' ? 'diamondLoop' : 'arc'));
          note.pathTemplate = note.pathVariant;
        } else if (mechanic === 'spin') {
          note.pathVariant = null; note.pathTemplate = null;
          note.inputChannel = 'mouse'; note.exclusivity = 'solo-mouse';
        } else {
          stripComplexPath(note);
        }
        continue;
      }

      // Legacy path: no arranged family — full mechanic planning
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

      // drag/spin are always mouse-only, no keyboard hint
      if (mechanic === 'drag' || mechanic === 'spin') {
        note.inputChannel = 'mouse';
        note.keyHint = null;
        note.keyboardKey = null;
        note.exclusivity = mechanic === 'spin' ? 'solo-mouse' : 'normal';
        return;
      }

      // Decide: keyboard or mouse. No "shared" — every note is one or the other.
      // Rule: ~40% keyboard (spread evenly), rest mouse.
      // Keyboard notes get their key from keyset[laneHint]; mouse notes get nothing.
      const wantKeyboard = (idx % 5 === 0 || idx % 5 === 2); // ~40%

      if (wantKeyboard) {
        const lane = Math.max(0, Math.min(keyset.length - 1, Math.abs(Number(note.laneHint || 0)) % keyset.length));
        const key = keyset[lane] || keyset[0];
        note.inputChannel = 'keyboard';
        note.keyHint = key;
        note.keyboardKey = String(key).toLowerCase();
        note.exclusivity = 'normal';
      } else {
        note.inputChannel = 'mouse';
        note.keyHint = null;
        note.keyboardKey = null;
        note.exclusivity = 'normal';
      }
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
    if (modern === 'drag') return (note?.pathVariant === 'starTrace') ? 'SWIPE' : 'DRAG';
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
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    if (options.allowDensityBackfill !== true) return seq;
    const minFirst30 = Number(options.minFirst30 || 12);
    const minPer10 = Number(options.minPer10 || 3);
    const maxTapRatio = Number(options.maxTapRatio || 0.58);
    const minLatterSpecialRatio = Number(options.minLatterSpecialRatio || 0.22);
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

  function estimateBarLengthSec(notes, options = {}) {
    const beatsPerBar = Math.max(2, Number(options.beatsPerBar || 4));
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const downbeats = Array.isArray(options.downbeats) ? options.downbeats.map(Number).filter(n => Number.isFinite(n)) : [];
    if (downbeats.length >= 2) {
      const deltas = [];
      for (let i = 1; i < downbeats.length; i += 1) {
        const dt = downbeats[i] - downbeats[i - 1];
        if (dt > 0.8 && dt < 5.5) deltas.push(dt);
      }
      if (deltas.length) {
        deltas.sort((a, b) => a - b);
        return Math.max(1.0, Math.min(6.0, deltas[Math.floor(deltas.length / 2)] || 60 / 122 * beatsPerBar));
      }
    }
    const beats = Array.isArray(options.beats) ? options.beats.map(Number).filter(n => Number.isFinite(n)) : [];
    if (beats.length >= beatsPerBar + 1) {
      const deltas = [];
      for (let i = beatsPerBar; i < beats.length; i += beatsPerBar) {
        const dt = beats[i] - beats[i - beatsPerBar];
        if (dt > 0.8 && dt < 5.5) deltas.push(dt);
      }
      if (deltas.length) {
        deltas.sort((a, b) => a - b);
        return Math.max(1.0, Math.min(6.0, deltas[Math.floor(deltas.length / 2)] || 60 / 122 * beatsPerBar));
      }
    }
    const deltas = [];
    for (let i = 1; i < seq.length; i += 1) {
      const dt = Number(seq[i].time || 0) - Number(seq[i - 1].time || 0);
      if (dt > 0.18 && dt < 1.25) deltas.push(dt);
    }
    if (!deltas.length) return 60 / 122 * beatsPerBar;
    deltas.sort((a, b) => a - b);
    const beatSec = deltas[Math.floor(deltas.length / 2)] || 0.5;
    return Math.max(1.0, Math.min(4.0, beatSec * beatsPerBar));
  }

  function estimateNoteCost(note, context = {}) {
    const proposal = legacyToModern(note?.proposalType || note?.proposalMechanic || note?.type || note?.noteType, note || {}).mechanic;
    let cost = 1.0;
    if (proposal === 'hold') cost = 1.35;
    else if (proposal === 'drag') cost = 1.65;
    else if (proposal === 'spin') cost = 2.2;
    if (context.largeLaneJump) cost += 0.25;
    if (context.denseSubWindow) cost += 0.30;
    if (context.familySwitchLoad) cost += 0.20;
    if (context.overlapsSustainPressure) cost += 0.35;
    return cost;
  }

  function classifyBarEnergy(candidates, prevPlan = null, options = {}) {
    const heavyThreshold = Number(options.barHeavyThreshold || 5.0);
    const mediumThreshold = Number(options.barMediumThreshold || 2.8);
    const totalStrength = candidates.reduce((sum, note) => sum + Number(note?.strength || note?.accentWeight || 1), 0);
    if (!candidates.length || totalStrength < 0.85) return 'rest';

    // Use segment energy directly if available from analysis
    const segments = Array.isArray(options.segments) ? options.segments : [];
    if (segments.length && candidates.length) {
      const midTime = Number(candidates[Math.floor(candidates.length / 2)]?.time || 0);
      const seg = segments.find(s => midTime >= Number(s.start || 0) && midTime < Number(s.end || 0));
      if (seg) {
        const label = String(seg.label || '');
        const energy = String(seg.energy || 'mid');
        if (label === 'break' || energy === 'low') return 'rest';
        if (label === 'intro') return totalStrength >= mediumThreshold ? 'light' : 'rest';
        if (label === 'outro') return 'light';
        if ((label === 'chorus' || label === 'drop') && energy === 'high') return totalStrength >= heavyThreshold ? 'heavy' : 'medium';
        if (energy === 'high') return 'medium';
      }
    }

    if (prevPlan && (prevPlan.energyLevel === 'heavy' || prevPlan.energyLevel === 'climax') && totalStrength >= heavyThreshold) return 'medium';
    if (totalStrength >= heavyThreshold) return 'heavy';
    if (totalStrength >= mediumThreshold) return 'medium';
    return 'light';
  }

  function chooseBarFamily(plan, prevPlan = null, options = {}) {
    const seg = String(plan?.segmentLabel || 'verse');
    const energy = String(plan?.energyLevel || 'light');
    const familiesBySegment = {
      intro: ['rest', 'single-tap-accent', 'alternating-taps', 'hold-anchor'],
      verse: ['alternating-taps', 'hold-anchor', 'mixed-light', 'cross-lane-call-response'],
      chorus: ['sync-accent', 'drag-sweep', 'mixed-heavy', 'burst-then-rest'],
      bridge: ['hold-anchor', 'cross-lane-call-response', 'drag-sweep', 'mixed-light'],
      outro: ['rest', 'single-tap-accent', 'hold-anchor', 'burst-then-rest']
    };
    let choices = familiesBySegment[seg] || familiesBySegment.verse;
    if (energy === 'rest') return 'rest';
    if (energy === 'light') choices = choices.filter(f => !['mixed-heavy', 'drag-sweep'].includes(f));
    if (energy === 'medium') choices = choices.filter(f => f !== 'rest');
    if (energy === 'heavy') choices = choices.filter(f => f !== 'rest');
    if (!choices.length) choices = ['alternating-taps'];
    if (prevPlan && prevPlan.mechanicFamily === choices[0] && choices.length > 1) return choices[1];
    return choices[0];
  }

  function buildBarPlan(notes, options = {}) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    if (!seq.length) return { bars: [], stats: { barLengthSec: estimateBarLengthSec([], options) } };
    const barLengthSec = estimateBarLengthSec(seq, options);
    const beatsPerBar = Math.max(2, Number(options.beatsPerBar || 4));
    const openingSafeBars = Math.max(2, Number(options.openingSafeBars || 8));
    const downbeats = Array.isArray(options.downbeats) ? options.downbeats.map(Number).filter(n => Number.isFinite(n)).sort((a, b) => a - b) : [];
    const lastTime = Number(seq[seq.length - 1]?.time || 0);
    const barBoundaries = downbeats.length >= 2
      ? [...downbeats, Number((downbeats[downbeats.length - 1] + barLengthSec).toFixed(3))]
      : null;
    const barCount = barBoundaries ? Math.max(1, barBoundaries.length - 1) : Math.max(1, Math.floor(lastTime / barLengthSec) + 1);
    const budgets = {
      rest: 0.8,
      light: 3.6,
      medium: 4.2,
      heavy: 5.2,
      climax: 6.0,
      ...(options.defaultDensityBudgetByEnergy || {})
    };
    const sustainBudgets = {
      rest: 0,
      light: 0,
      medium: 1,
      heavy: 1,
      climax: 1,
      ...(options.defaultSustainBudgetByEnergy || {})
    };
    const simultaneousCaps = {
      rest: 1,
      light: 1,
      medium: 2,
      heavy: 2,
      climax: 2,
      ...(options.simultaneousCapByEnergy || {})
    };

    const bars = [];
    let prevPlan = null;
    for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
      const startTime = Number((barBoundaries ? barBoundaries[barIndex] : (barIndex * barLengthSec)).toFixed(3));
      const endTime = Number((barBoundaries ? barBoundaries[barIndex + 1] : (startTime + barLengthSec)).toFixed(3));
      const candidates = seq.filter(note => Number(note.time || 0) >= startTime && Number(note.time || 0) < endTime);
      const segmentLabel = candidates[0]?.segmentLabel || prevPlan?.segmentLabel || 'verse';
      let energyLevel = classifyBarEnergy(candidates, prevPlan, options);
      if (barIndex < 2 && energyLevel !== 'rest') energyLevel = 'light';
      else if (barIndex < 4 && energyLevel === 'heavy') energyLevel = 'medium';
      else if (barIndex < openingSafeBars && energyLevel === 'climax') energyLevel = 'heavy';
      if (prevPlan && (prevPlan.energyLevel === 'heavy' || prevPlan.energyLevel === 'climax') && (energyLevel === 'heavy' || energyLevel === 'climax')) energyLevel = 'medium';
      // Forced full rest every N bars (default 8): gives players real breathing room
      const breathingEvery = Math.max(4, Number(options.breathingEveryBars || 8));
      if (barIndex > 2 && barIndex % breathingEvery === 0 && energyLevel !== 'rest') {
        energyLevel = 'rest';
      } else if (prevPlan && prevPlan.energyLevel !== 'rest' && energyLevel !== 'rest' && barIndex % Math.max(2, Number(options.breathingMinEveryBars || 3)) === 0) {
        energyLevel = energyLevel === 'heavy' ? 'light' : energyLevel;
      }
      // Insert rest bar at important segment transitions (verse→chorus, chorus→bridge, bridge→outro)
      const importantTransition = prevPlan &&
        ((prevPlan.segmentLabel === 'verse' && segmentLabel === 'chorus') ||
         (prevPlan.segmentLabel === 'chorus' && segmentLabel === 'bridge') ||
         (prevPlan.segmentLabel === 'bridge' && segmentLabel === 'outro'));
      if (importantTransition && barIndex > 2 && energyLevel !== 'rest') energyLevel = 'rest';
      const mechanicFamily = chooseBarFamily({ segmentLabel, energyLevel }, prevPlan, options);
      const phraseIndex = Number(candidates[0]?.phrase || prevPlan?.phraseIndex || 0);
      const restRatio = energyLevel === 'rest' ? 1 : (energyLevel === 'light' ? 0.35 : energyLevel === 'medium' ? 0.18 : 0.1);
      const variationSeed = stableUnit({ time: startTime, laneHint: barIndex % 4, phrase: phraseIndex }, barIndex + 41);
      const repetitionPenalty = prevPlan && prevPlan.mechanicFamily === mechanicFamily ? Math.min(1, Number(prevPlan.repetitionPenalty || 0) + 0.35) : 0;
      bars.push({
        barIndex,
        startTime,
        endTime,
        segmentLabel,
        phraseIndex,
        energyLevel,
        densityBudget: Number(budgets[energyLevel] || 3.2),
        sustainBudget: Number(sustainBudgets[energyLevel] || 0),
        simultaneousCap: Number(simultaneousCaps[energyLevel] || 1),
        mechanicFamily,
        variationSeed,
        repetitionPenalty,
        cooldownFlags: {
          recentHoldHeavy: Boolean(prevPlan && prevPlan.mechanicFamily === 'hold-anchor' && (prevPlan.energyLevel === 'heavy' || prevPlan.energyLevel === 'climax')),
          recentDragHeavy: Boolean(prevPlan && prevPlan.mechanicFamily === 'drag-sweep' && (prevPlan.energyLevel === 'heavy' || prevPlan.energyLevel === 'climax'))
        },
        accentPattern: energyLevel === 'rest' ? 'sparse' : (energyLevel === 'light' ? 'strong-1' : 'strong-1-3'),
        restRatio,
        handTravelBudget: energyLevel === 'heavy' ? 2.0 : 1.6,
        readabilityBudget: energyLevel === 'heavy' ? 2.8 : 2.2,
        targetInputBias: mechanicFamily === 'drag-sweep' ? 'mouse' : (mechanicFamily === 'hold-anchor' ? 'mixed' : 'keyboard'),
        maxNoteCount: energyLevel === 'rest' ? 1 : (energyLevel === 'light' ? 3 : (energyLevel === 'medium' ? 5 : 7)),
        maxWindowStrain: energyLevel === 'rest' ? 1.2 : (energyLevel === 'light' ? 4.0 : (energyLevel === 'medium' ? 5.5 : (energyLevel === 'heavy' ? 6.5 : 7.5))),
        restMode: energyLevel === 'rest' ? 'strong' : (energyLevel === 'light' ? 'partial' : 'none'),
        mustPreserveGapRanges: energyLevel === 'rest'
          ? [[Number(startTime.toFixed(3)), Number(endTime.toFixed(3))]]
          : (mechanicFamily === 'burst-then-rest'
              ? [[Number((startTime + (endTime - startTime) * 0.58).toFixed(3)), Number(endTime.toFixed(3))]]
              : []),
        candidateCount: candidates.length
      });
      prevPlan = bars[bars.length - 1];
    }
    return { bars, stats: { barLengthSec, beatsPerBar, barCount } };
  }

  function arrangeBars(notes, barPlan, options = {}) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const bars = Array.isArray(barPlan?.bars) ? barPlan.bars : [];
    const arrangedNotes = [];
    const pressureWindowSec = Math.max(0.35, Number(options.pressureWindowMs || 1000) / 1000);
    const scoreCandidate = (note, candidates, idx, plan, selectedSoFar) => {
      const prev = idx > 0 ? candidates[idx - 1] : null;
      const dt = prev ? Number(note.time || 0) - Number(prev.time || 0) : 99;
      const largeLaneJump = prev ? Math.abs(Number(note.laneHint || 0) - Number(prev.laneHint || 0)) >= 2 : false;
      const denseSubWindow = dt < 0.42;
      const overlapsSustainPressure = isSustainedType(note?.proposalType || note?.proposalMechanic || note?.type || note?.noteType) && selectedSoFar.some(other => isSustainedType(other?.proposalType || other?.type || other?.noteType) && Math.abs(Number(other.time || 0) - Number(note.time || 0)) < pressureWindowSec);
      const familySwitchLoad = plan.repetitionPenalty >= 0.3 && idx === 0;
      const cost = estimateNoteCost(note, { largeLaneJump, denseSubWindow, overlapsSustainPressure, familySwitchLoad });
      const strength = Number(note?.strength || note?.accentWeight || 1);
      const downbeatBias = Number(note?.downbeatBias || 0);
      const segBias = ['chorus', 'bridge'].includes(String(note?.segmentLabel || '')) ? 0.15 : 0;
      return { note, cost, score: strength + downbeatBias + segBias - cost * 0.18 - (denseSubWindow ? 0.12 : 0) };
    };
    for (const plan of bars) {
      const candidates = seq.filter(note => Number(note.time || 0) >= Number(plan.startTime || 0) && Number(note.time || 0) < Number(plan.endTime || 0));
      const microWindows = buildMicroWindows(plan, options);
      let ranked = candidates.map((note, idx) => scoreCandidate(note, candidates, idx, plan, arrangedNotes))
        .sort((a, b) => b.score - a.score || Number(a.note.time || 0) - Number(b.note.time || 0));

      if (plan.mechanicFamily === 'alternating-taps' || plan.mechanicFamily === 'cross-lane-call-response') {
        ranked = ranked.filter(item => legacyToModern(item.note?.proposalType || item.note?.type || item.note?.noteType, item.note).mechanic === 'tap' || item.note.segmentLabel === 'chorus');
      } else if (plan.mechanicFamily === 'hold-anchor') {
        const holdFirst = ranked.find(item => legacyToModern(item.note?.proposalType || item.note?.type || item.note?.noteType, item.note).mechanic === 'hold');
        const rest = ranked.filter(item => item !== holdFirst && legacyToModern(item.note?.proposalType || item.note?.type || item.note?.noteType, item.note).mechanic !== 'drag');
        ranked = holdFirst ? [holdFirst, ...rest] : rest;
      } else if (plan.mechanicFamily === 'drag-sweep') {
        const dragFirst = ranked.find(item => legacyToModern(item.note?.proposalType || item.note?.type || item.note?.noteType, item.note).mechanic === 'drag');
        const rest = ranked.filter(item => item !== dragFirst && legacyToModern(item.note?.proposalType || item.note?.type || item.note?.noteType, item.note).mechanic !== 'hold');
        ranked = dragFirst ? [dragFirst, ...rest] : rest;
      } else if (plan.mechanicFamily === 'burst-then-rest') {
        ranked = ranked.filter(item => Number(item.note?.time || 0) <= Number(plan.startTime || 0) + (Number(plan.endTime || 0) - Number(plan.startTime || 0)) * 0.55);
      } else if (plan.mechanicFamily === 'sync-accent') {
        ranked = ranked.filter(item => Number(item.note?.downbeatBias || 0) > 0 || Number(item.note?.strength || item.note?.accentWeight || 0) >= 1);
      }

      let remainingBudget = Number(plan.densityBudget || 0);
      let remainingSustain = Number(plan.sustainBudget || 0);
      const selected = [];
      for (const item of ranked) {
        if (selected.length >= Number(plan.maxNoteCount || Infinity)) continue;
        const note = { ...item.note };
        const proposal = legacyToModern(note?.proposalType || note?.proposalMechanic || note?.type || note?.noteType, note).mechanic;
        const isSustain = isSustainedType(proposal);
        const tooClose = selected.some(other => Math.abs(Number(other.time || 0) - Number(note.time || 0)) < 0.22);
        if (tooClose) continue;
        if (noteInGapRange(note, plan.mustPreserveGapRanges || [])) continue;
        if (plan.mechanicFamily === 'rest' && selected.length >= 1) continue;
        if (plan.mechanicFamily === 'single-tap-accent' && selected.length >= 2) continue;
        if (plan.mechanicFamily === 'alternating-taps' && proposal !== 'tap') continue;
        if (plan.mechanicFamily === 'cross-lane-call-response' && proposal !== 'tap' && proposal !== 'hold') continue;
        if (plan.mechanicFamily === 'hold-anchor' && proposal === 'drag') continue;
        if (plan.mechanicFamily === 'drag-sweep' && proposal === 'hold') continue;
        if (plan.mechanicFamily === 'burst-then-rest' && selected.length >= Math.max(2, Number(plan.simultaneousCap || 2) + 1)) continue;
        if (isSustain && remainingSustain <= 0) continue;
        if (remainingBudget - item.cost < -0.05) continue;

        const window = microWindows.find(w => Number(note.time || 0) >= w.start && Number(note.time || 0) < w.end) || microWindows[microWindows.length - 1];
        const candidateWindowNotes = [...(window?.notes || []), note];
        const projectedStrain = calculateWindowStrainForNotes(candidateWindowNotes, options);
        if (window && projectedStrain > Number(window.maxStrain || plan.maxWindowStrain || Infinity)) continue;

        remainingBudget -= item.cost;
        if (isSustain) remainingSustain -= 1;
        note.arranged = true;
        note.arrangedFamily = plan.mechanicFamily;
        note.arrangedBarEnergy = plan.energyLevel;
        note.arrangedCost = Number(item.cost.toFixed(2));
        note.keepReason = selected.length === 0 ? 'bar-accent' : 'budget-fit';
        if (plan.mechanicFamily === 'cross-lane-call-response' && selected.length > 0) {
          const prevSelected = selected[selected.length - 1];
          if (Math.abs(Number(prevSelected.laneHint || 0) - Number(note.laneHint || 0)) < 1) note.laneHint = (Number(prevSelected.laneHint || 0) + 2) % 4;
        }
        if (plan.mechanicFamily === 'hold-anchor' && selected.length > 0 && proposal === 'tap') note.keepReason = 'anchor-support';
        if (plan.mechanicFamily === 'drag-sweep' && selected.length > 0 && proposal === 'tap') note.keepReason = 'drag-followup';
        if (plan.mechanicFamily === 'burst-then-rest') note.keepReason = selected.length === 0 ? 'burst-lead' : 'burst-fill';
        selected.push(note);
        if (window) window.notes.push(note);
      }
      selected.sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
      arrangedNotes.push(...selected);
    }
    return { bars, arrangedNotes: arrangedNotes.sort((a, b) => Number(a.time || 0) - Number(b.time || 0)), stats: { kept: arrangedNotes.length, total: seq.length } };
  }

  function materializeBarPlan(arranged, options = {}) {
    const notes = Array.isArray(arranged?.arrangedNotes) ? arranged.arrangedNotes : [];
    const bars = Array.isArray(arranged?.bars) ? arranged.bars : [];
    return [...notes].sort((a, b) => Number(a.time || 0) - Number(b.time || 0)).map(note => {
      const bar = bars.find(b => Number(note.time || 0) >= Number(b.startTime || 0) && Number(note.time || 0) < Number(b.endTime || 0)) || null;
      const normalized = normalizeNoteSchema({ ...note });
      normalized.plannerConstraints = bar ? {
        barIndex: bar.barIndex,
        energyLevel: bar.energyLevel,
        mechanicFamily: bar.mechanicFamily,
        maxWindowStrain: bar.maxWindowStrain,
        maxNoteCount: bar.maxNoteCount,
        restMode: bar.restMode,
        mustPreserveGapRanges: bar.mustPreserveGapRanges || []
      } : null;
      normalized.plannerLocked = true;
      return normalized;
    });
  }

  function buildMicroWindows(bar, options = {}) {
    const startTime = Number(bar?.startTime || 0);
    const endTime = Math.max(startTime, Number(bar?.endTime || startTime));
    const windowSec = Math.max(0.2, Number(options.windowMs || 500) / 1000);
    const windows = [];
    for (let start = startTime; start < endTime - 0.0001; start += windowSec) {
      windows.push({
        start: Number(start.toFixed(3)),
        end: Number(Math.min(endTime, start + windowSec).toFixed(3)),
        maxStrain: Number(bar?.maxWindowStrain || 4),
        notes: []
      });
    }
    if (!windows.length) {
      windows.push({ start: startTime, end: endTime, maxStrain: Number(bar?.maxWindowStrain || 4), notes: [] });
    }
    return windows;
  }

  function noteInGapRange(note, gapRanges = []) {
    const t = Number(note?.time || 0);
    return (gapRanges || []).some(range => t >= Number(range?.[0] || 0) && t <= Number(range?.[1] || 0));
  }

  function calculateWindowStrainForNotes(notes, options = {}) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    let strain = 0;
    const openingSeconds = Number(options.openingSeconds || 12);
    const openingMultiplier = Number(options.openingWindowStrainMultiplier || 1.25);
    for (let i = 0; i < seq.length; i += 1) {
      const note = seq[i];
      const type = legacyToModern(note?.proposalType || note?.proposalMechanic || note?.type || note?.noteType, note).mechanic;
      strain += estimateNoteCost(note, {});
      if (type === 'hold') strain += 0.5;
      if (type === 'drag') strain += 0.2;
      if (type === 'spin') strain += 0.4;
      if (Number(note.time || 0) <= Math.min(4, openingSeconds)) strain *= openingMultiplier;
      if (i > 0) {
        const prev = seq[i - 1];
        const prevType = legacyToModern(prev?.proposalType || prev?.proposalMechanic || prev?.type || prev?.noteType, prev).mechanic;
        const dt = Number(note.time || 0) - Number(prev.time || 0);
        if (dt < 0.12) strain += 1.1;
        else if (dt < 0.18) strain += 0.6;
        else if (dt < 0.25) strain += 0.3;
        const prevChannel = prev.inputChannel || prev.proposalInputChannel || 'shared';
        const channel = note.inputChannel || note.proposalInputChannel || 'shared';
        if (prevChannel !== channel && prevChannel !== 'shared' && channel !== 'shared') strain += 0.6;
        if (isSustainedType(prevType) && dt < 0.6) strain += 0.7;
        if ((prevType === 'drag' || prevType === 'spin' || type === 'drag' || type === 'spin') && dt < 0.7) strain += 0.8;
        const laneJump = Math.abs(Number(note.laneHint || 0) - Number(prev.laneHint || 0));
        if (laneJump >= 1.5) strain += 0.3;
        if (laneJump >= 2.5) strain += 0.4;
      }
      if (note.pathVariant && ['diamondLoop', 'starTrace'].includes(note.pathVariant)) strain += 0.15;
    }
    return Number(strain.toFixed(2));
  }

  function windowStrainStats(notes, options = {}) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const windowSec = Math.max(0.2, Number(options.windowMs || 500) / 1000);
    const endTime = Number(seq[seq.length - 1]?.time || 0);
    const windows = [];
    for (let start = 0; start <= endTime + 0.001; start += windowSec) {
      const end = start + windowSec;
      const bucket = seq.filter(note => Number(note.time || 0) >= start && Number(note.time || 0) < end);
      let strain = 0;
      for (let i = 0; i < bucket.length; i += 1) {
        const note = bucket[i];
        strain += estimateNoteCost(note, {});
        if (i > 0) {
          const prev = bucket[i - 1];
          const dt = Number(note.time || 0) - Number(prev.time || 0);
          if (dt < 0.12) strain += 1.1;
          else if (dt < 0.18) strain += 0.6;
          else if (dt < 0.25) strain += 0.3;
          const prevChannel = prev.inputChannel || prev.proposalInputChannel || 'shared';
          const channel = note.inputChannel || note.proposalInputChannel || 'shared';
          if (prevChannel !== channel && prevChannel !== 'shared' && channel !== 'shared') strain += 0.6;
        }
      }
      windows.push({ start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), noteCount: bucket.length, strain: Number(strain.toFixed(2)) });
    }
    return { windowSec, windows, maxStrain: Math.max(0, ...windows.map(w => w.strain)) };
  }

  function summarizeStage(notes, bars = [], options = {}) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    return {
      noteCount: seq.length,
      mechanic: mechanicMixStats(seq),
      density: densityStats(seq, 10, 30),
      strain: windowStrainStats(seq, options),
      bars: (bars || []).map(bar => ({
        barIndex: bar.barIndex,
        energyLevel: bar.energyLevel,
        mechanicFamily: bar.mechanicFamily,
        candidateCount: bar.candidateCount,
        maxWindowStrain: bar.maxWindowStrain,
        mustPreserveGapRanges: bar.mustPreserveGapRanges || []
      }))
    };
  }

  function enforcePlannerConstraints(notes, bars = [], options = {}) {
    const seq = [...(notes || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const out = [];
    for (const bar of (bars || [])) {
      const barNotes = seq.filter(note => Number(note.time || 0) >= Number(bar.startTime || 0) && Number(note.time || 0) < Number(bar.endTime || 0));
      const filtered = [];
      for (const note of barNotes) {
        if (noteInGapRange(note, bar.mustPreserveGapRanges || [])) continue;
        filtered.push(note);
      }
      const cappedByCount = filtered.slice(0, Math.max(0, Number(bar.maxNoteCount || filtered.length)));
      const microWindows = buildMicroWindows(bar, options);
      for (const note of cappedByCount) {
        const window = microWindows.find(w => Number(note.time || 0) >= w.start && Number(note.time || 0) < w.end) || microWindows[microWindows.length - 1];
        const projected = calculateWindowStrainForNotes([...(window?.notes || []), note], options);
        if (projected > Number(window?.maxStrain || bar.maxWindowStrain || Infinity)) {
          const downgraded = { ...note, type: downgradeType(note.type || note.noteType), noteType: downgradeType(note.type || note.noteType), mechanic: downgradeType(note.type || note.noteType) };
          const downgradedProjected = calculateWindowStrainForNotes([...(window?.notes || []), downgraded], options);
          if (downgradedProjected > Number(window?.maxStrain || bar.maxWindowStrain || Infinity)) continue;
          window.notes.push(downgraded);
          out.push(downgraded);
          continue;
        }
        if (window) window.notes.push(note);
        out.push(note);
      }
    }
    return out.sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
  }

  function pipelineSnapshots(notes, options = {}) {
    const candidate = layerABaseChartProposal(notes || []);
    const barPlan = buildBarPlan(candidate, options);
    const arranged = arrangeBars(candidate, barPlan, options);
    const materialized = materializeBarPlan(arranged, options);
    let finalized = layerBMechanicPlanner(materialized, options);
    finalized = layerCInputChannelPlanner(finalized, options);
    finalized = layerDOpeningGuard(finalized, options);
    finalized = layerEPlayabilityGuard(finalized, options);
    finalized = layerFGeometryPrep(finalized, options);
    finalized = enforcePlannerConstraints(finalized, arranged.bars, options);
    finalized = layerGRuntimeAudit(finalized, options).notes;
    return {
      candidate: summarizeStage(candidate, [], options),
      arranged: summarizeStage(arranged.arrangedNotes, arranged.bars, options),
      materialized: summarizeStage(materialized, arranged.bars, options),
      finalized: summarizeStage(finalized, arranged.bars, options)
    };
  }

  function spreadQuotaPromotions(notes) { return layerBMechanicPlanner(notes); }

  function auditChartShape(notes) {
    return { mechanic: mechanicMixStats(notes), spatial: spatialFlowStats(notes), geometry: geometryTemplateStats(notes) };
  }

  function finalizePlayableChartPipeline(notes, options = {}) {
    let seq = layerABaseChartProposal(notes || []);
    const barPlan = buildBarPlan(seq, options);
    const arranged = arrangeBars(seq, barPlan, options);
    seq = materializeBarPlan(arranged, options);
    seq = layerBMechanicPlanner(seq, options);
    // layerD/E may downgrade drag/hold/spin → tap, changing noteType but NOT inputChannel.
    // Run layerC AFTER all downgrades so inputChannel always matches final noteType.
    seq = layerDOpeningGuard(seq, options);
    seq = layerEPlayabilityGuard(seq, options);
    seq = layerFGeometryPrep(seq, options);
    seq = enforcePlannerConstraints(seq, arranged.bars, options);
    const result = layerGRuntimeAudit(seq, options);
    seq = layerCInputChannelPlanner([...result.notes], options);
    return seq.sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
  }

  const api = { spreadQuotaPromotions, assignMechanics, applyMousePlayabilityFilter, applyOpeningWindowPolicy, enforceChartPlayability, tutorialLabelForType, assignKeyboardCheckpoints, makeFootprint, footprintsOverlap, auditFootprints, sortByLayoutPriority, footprintSeverity, resolvePathConflicts, finalizePlayableChartPipeline, densityStats, enforceDensityFloor, mechanicMixStats, spatialFlowStats, geometryTemplateStats, auditChartShape, keyboardLayoutForDifficulty, layerABaseChartProposal, layerBMechanicPlanner, layerCInputChannelPlanner, layerDOpeningGuard, layerEPlayabilityGuard, layerFGeometryPrep, layerGRuntimeAudit, downgradeType, isSustainedType, normalizeNoteSchema, stripComplexPath, estimateBarLengthSec, estimateNoteCost, buildBarPlan, arrangeBars, materializeBarPlan, buildMicroWindows, noteInGapRange, calculateWindowStrainForNotes, windowStrainStats, summarizeStage, pipelineSnapshots, enforcePlannerConstraints };
  if (typeof window !== 'undefined') window.ChartPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
