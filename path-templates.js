(function () {
  function sampleOrbit(startX, startY, endX, endY, radiusScale) {
    if (radiusScale === undefined) radiusScale = 1.0;
    var midX = (startX + endX) / 2;
    var midY = (startY + endY) / 2;
    var dx = endX - startX;
    var dy = endY - startY;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len;
    var ny = dx / len;
    var radius = len * 0.7 * radiusScale;
    return {
      kind: 'orbit',
      controlX: midX + nx * radius * 0.6,
      controlY: midY + ny * radius * 0.6
    };
  }

  function sampleDiamondLoop(startX, startY, endX, endY) {
    var midX = (startX + endX) / 2;
    var midY = (startY + endY) / 2;
    return {
      kind: 'diamondLoop',
      points: [
        { x: startX, y: startY },
        { x: midX, y: startY - Math.abs(endY - startY) * 0.9 - 40 },
        { x: endX, y: endY },
        { x: midX, y: endY + Math.abs(endY - startY) * 0.9 + 40 }
      ]
    };
  }

  function sampleStarTrace(startX, startY, endX, endY) {
    var midX = (startX + endX) / 2;
    var midY = (startY + endY) / 2;
    var span = Math.max(80, Math.hypot(endX - startX, endY - startY));
    return {
      kind: 'starTrace',
      points: [
        { x: startX, y: startY },
        { x: midX - span * 0.2, y: midY - span * 0.6 },
        { x: midX, y: midY - span * 0.15 },
        { x: midX + span * 0.2, y: midY - span * 0.6 },
        { x: endX, y: endY }
      ]
    };
  }

  function sampleSpiral(startX, startY, endX, endY) {
    var midX = (startX + endX) / 2;
    var midY = (startY + endY) / 2;
    var dx = endX - startX;
    var dy = endY - startY;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len;
    var ny = dx / len;
    var arc = len * 0.45;
    return {
      kind: 'spiral',
      points: [
        { x: startX, y: startY },
        { x: startX + dx * 0.25 + nx * arc * 0.6, y: startY + dy * 0.25 + ny * arc * 0.6 },
        { x: midX + nx * arc * 0.3, y: midY + ny * arc * 0.3 },
        { x: startX + dx * 0.75 - nx * arc * 0.4, y: startY + dy * 0.75 - ny * arc * 0.4 },
        { x: endX, y: endY }
      ]
    };
  }

  function sampleZigzag(startX, startY, endX, endY) {
    var dx = endX - startX;
    var dy = endY - startY;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len;
    var ny = dx / len;
    var offset = len * 0.3;
    return {
      kind: 'zigzag',
      points: [
        { x: startX, y: startY },
        { x: startX + dx * 0.25 + nx * offset, y: startY + dy * 0.25 + ny * offset },
        { x: startX + dx * 0.5 - nx * offset, y: startY + dy * 0.5 - ny * offset },
        { x: startX + dx * 0.75 + nx * offset * 0.6, y: startY + dy * 0.75 + ny * offset * 0.6 },
        { x: endX, y: endY }
      ]
    };
  }

  function sampleScurve(startX, startY, endX, endY) {
    var dx = endX - startX;
    var dy = endY - startY;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len;
    var ny = dx / len;
    var curve = len * 0.38;
    var mx = (startX + endX) / 2;
    var my = (startY + endY) / 2;
    return {
      kind: 'scurve',
      points: [
        { x: startX, y: startY },
        { x: startX + dx * 0.3 + nx * curve, y: startY + dy * 0.3 + ny * curve },
        { x: mx, y: my },
        { x: startX + dx * 0.7 - nx * curve, y: startY + dy * 0.7 - ny * curve },
        { x: endX, y: endY }
      ]
    };
  }

  /* ────── NEW: Heart shape ────── */
  function sampleHeart(startX, startY, endX, endY) {
    var midX = (startX + endX) / 2;
    var midY = (startY + endY) / 2;
    var dist = Math.hypot(endX - startX, endY - startY) || 80;
    // Scale the heart proportionally to the note distance but cap it so it
    // never extends far beyond the start/end region.
    var heartScale = Math.min(dist * 0.38, 140);
    var points = [];
    var steps = 48;
    for (var i = 0; i <= steps; i++) {
      var t = (i / steps) * Math.PI * 2;
      // Classic parametric heart equation
      var hx = 16 * Math.pow(Math.sin(t), 3);
      var hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      points.push({
        x: midX + (hx / 17) * heartScale,
        y: midY - (hy / 17) * heartScale
      });
    }
    // Blend start/end so the path begins at startX,startY and ends at endX,endY
    var blend = 5;
    for (var bi = 0; bi < blend; bi++) {
      var w = 1 - bi / blend;
      points[bi].x = startX * w + points[bi].x * (1 - w);
      points[bi].y = startY * w + points[bi].y * (1 - w);
    }
    for (var bj = 0; bj < blend; bj++) {
      var idx = points.length - 1 - bj;
      var we = 1 - bj / blend;
      points[idx].x = endX * we + points[idx].x * (1 - we);
      points[idx].y = endY * we + points[idx].y * (1 - we);
    }
    return { kind: 'heart', points: points };
  }

  /* ────── NEW: Vortex / spiral-inward ────── */
  function sampleVortex(startX, startY, endX, endY) {
    var midX = (startX + endX) / 2;
    var midY = (startY + endY) / 2;
    var dist = Math.hypot(endX - startX, endY - startY) || 80;
    var maxRadius = Math.min(dist * 0.38, 140);
    var turns = 2.5;
    var totalAngle = Math.PI * 2 * turns;
    var steps = 60;
    var points = [];
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var angle = t * totalAngle;
      // Spiral inward
      var radius = maxRadius * (1 - t * 0.88);
      points.push({
        x: midX + Math.cos(angle) * radius,
        y: midY + Math.sin(angle) * radius
      });
    }
    var blend = 4;
    for (var bi = 0; bi < blend; bi++) {
      var w = 1 - bi / blend;
      points[bi].x = startX * w + points[bi].x * (1 - w);
      points[bi].y = startY * w + points[bi].y * (1 - w);
    }
    for (var bj = 0; bj < blend; bj++) {
      var idx = points.length - 1 - bj;
      var we = 1 - bj / blend;
      points[idx].x = endX * we + points[idx].x * (1 - we);
      points[idx].y = endY * we + points[idx].y * (1 - we);
    }
    return { kind: 'vortex', points: points };
  }

  function chooseTemplate(note, difficulty, context) {
    if (difficulty === undefined) difficulty = 'normal';
    if (!context) context = {};
    var seq = Math.abs(Number(note && note.noteNumber || 0));
    var segment = (note && note.segmentLabel) || 'verse';
    var intent = (note && note.phraseIntent) || 'drift';
    var recentTemplates = Array.isArray(context.recentTemplates) ? context.recentTemplates : [];
    var countRecent = function (name) { return recentTemplates.filter(function (v) { return v === name; }).length; };
    var forceGeometry = Boolean(context.forceGeometry);
    var geometryBiasBoost = Number(context.geometryBiasBoost || 0);
    var forceGeometryFloor = Number(context.forceGeometryFloor || 0);
    var inOpening = Boolean(note && note.openingCalmWindow) || Number(note && note.time || 0) < 6;

    var score = function (name) {
      var s = 0;
      if (name === 'orbit') s += difficulty === 'easy' ? 4 : 1.2;
      if (name === 'heart') s += (segment === 'chorus' ? 3.6 : 2.4) + geometryBiasBoost * 1.15;
      if (name === 'vortex') s += (segment === 'chorus' ? 3.4 : (segment === 'bridge' ? 2.8 : 1.6)) + geometryBiasBoost * 1.1;
      // Keep legacy scoring for diamondLoop/starTrace so tests referencing them still pass
      if (name === 'diamondLoop') s += (segment === 'chorus' ? 3.4 : 2.2) + geometryBiasBoost * 1.1;
      if (name === 'starTrace') s += (segment === 'chorus' ? 3.8 : (segment === 'bridge' ? 2.4 : 1.1)) + geometryBiasBoost * 1.25;
      if (name === 'spiral') s += (segment === 'verse' ? 2.6 : 1.8) + (intent === 'sweep' ? 1.2 : 0);
      if (name === 'zigzag') s += (segment === 'chorus' ? 2.8 : 1.6) + (difficulty === 'hard' ? 1.0 : 0);
      if (name === 'scurve') s += (segment === 'bridge' ? 2.9 : 2.0);
      if (intent === 'sweep' && (name === 'vortex' || name === 'starTrace')) s += 1.5;
      if (intent === 'pivot' && (name === 'heart' || name === 'diamondLoop')) s += 1.2;
      if (inOpening && name !== 'orbit') s -= 0.8;
      s -= countRecent(name) * 2.1;
      if ((forceGeometry || forceGeometryFloor >= 3) && name !== 'orbit') s += 4.8 + geometryBiasBoost * 0.8;
      if (difficulty === 'hard' && name !== 'orbit') s += 0.9;
      if (difficulty === 'easy' && (name === 'starTrace' || name === 'zigzag' || name === 'vortex')) s -= 2.2;
      s += ((seq * (name.length + 3)) % 7) * 0.07;
      return s;
    };

    var options = ['orbit', 'heart', 'vortex', 'diamondLoop', 'starTrace', 'spiral', 'zigzag', 'scurve'];
    options.sort(function (a, b) { return score(b) - score(a); });
    return options[0] || 'orbit';
  }

  function samplePathPoints(note, steps) {
    if (steps === undefined) steps = 100;
    if (note && note.extraPath && note.extraPath.points && note.extraPath.points.length) {
      var pts = note.extraPath.points;
      var result = [];
      var segments = Math.max(1, pts.length - 1);
      for (var i = 0; i < pts.length; i++) {
        result.push({ x: pts[i].x, y: pts[i].y, t: i / segments });
      }
      return result;
    }
    var out = [];
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var ptX = Math.pow(1-t, 2) * note.x + 2 * (1-t) * t * note.controlX + Math.pow(t, 2) * note.endX;
      var ptY = Math.pow(1-t, 2) * note.y + 2 * (1-t) * t * note.controlY + Math.pow(t, 2) * note.endY;
      out.push({ x: ptX, y: ptY, t: t });
    }
    return out;
  }

  var api = {
    sampleOrbit: sampleOrbit,
    sampleDiamondLoop: sampleDiamondLoop,
    sampleStarTrace: sampleStarTrace,
    sampleSpiral: sampleSpiral,
    sampleZigzag: sampleZigzag,
    sampleScurve: sampleScurve,
    sampleHeart: sampleHeart,
    sampleVortex: sampleVortex,
    chooseTemplate: chooseTemplate,
    samplePathPoints: samplePathPoints
  };
  if (typeof window !== 'undefined') window.PathTemplates = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
