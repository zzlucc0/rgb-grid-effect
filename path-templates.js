(function () {
  function sampleOrbit(startX, startY, endX, endY, radiusScale = 1.0) {
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const dx = endX - startX;
    const dy = endY - startY;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const radius = len * 0.7 * radiusScale;
    return {
      kind: 'orbit',
      controlX: midX + nx * radius * 0.6,
      controlY: midY + ny * radius * 0.6
    };
  }

  function sampleDiamondLoop(startX, startY, endX, endY) {
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
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
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const span = Math.max(80, Math.hypot(endX - startX, endY - startY));
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

  function chooseTemplate(note, difficulty = 'normal', context = {}) {
    const seq = Math.abs(Number(note?.noteNumber || 0));
    const segment = note?.segmentLabel || 'verse';
    const intent = note?.phraseIntent || 'drift';
    const recentTemplates = Array.isArray(context?.recentTemplates) ? context.recentTemplates : [];
    const countRecent = (name) => recentTemplates.filter(v => v === name).length;
    const forceGeometry = Boolean(context?.forceGeometry);
    const geometryBiasBoost = Number(context?.geometryBiasBoost || 0);
    const forceGeometryFloor = Number(context?.forceGeometryFloor || 0);
    const inOpening = Boolean(note?.openingCalmWindow) || Number(note?.time || 0) < 6;

    const score = (name) => {
      let s = 0;
      if (name === 'orbit') s += difficulty === 'easy' ? 4 : 1.2;
      if (name === 'diamondLoop') s += (segment === 'chorus' ? 3.4 : 2.2) + geometryBiasBoost * 1.1;
      if (name === 'starTrace') s += (segment === 'chorus' ? 3.8 : (segment === 'bridge' ? 2.4 : 1.1)) + geometryBiasBoost * 1.25;
      if (intent === 'sweep' && name === 'starTrace') s += 1.5;
      if (intent === 'pivot' && name === 'diamondLoop') s += 1.2;
      if (inOpening && name !== 'orbit') s -= 0.8;
      s -= countRecent(name) * 2.1;
      if ((forceGeometry || forceGeometryFloor >= 3) && name !== 'orbit') s += 4.8 + geometryBiasBoost * 0.8;
      if (difficulty === 'hard' && name !== 'orbit') s += 0.9;
      if (difficulty === 'easy' && name === 'starTrace') s -= 2.2;
      s += ((seq * (name.length + 3)) % 7) * 0.07;
      return s;
    };

    const options = ['orbit', 'diamondLoop', 'starTrace'];
    return options.sort((a, b) => score(b) - score(a))[0] || 'orbit';
  }

  function samplePathPoints(note, steps = 100) {
    if (note?.extraPath?.points?.length) {
      const pts = note.extraPath.points;
      const result = [];
      const segments = Math.max(1, pts.length - 1);
      for (let i = 0; i < pts.length; i++) {
        result.push({ x: pts[i].x, y: pts[i].y, t: i / segments });
      }
      return result;
    }
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ptX = Math.pow(1-t, 2) * note.x + 2 * (1-t) * t * note.controlX + Math.pow(t, 2) * note.endX;
      const ptY = Math.pow(1-t, 2) * note.y + 2 * (1-t) * t * note.controlY + Math.pow(t, 2) * note.endY;
      out.push({ x: ptX, y: ptY, t });
    }
    return out;
  }

  const api = { sampleOrbit, sampleDiamondLoop, sampleStarTrace, chooseTemplate, samplePathPoints };
  if (typeof window !== 'undefined') window.PathTemplates = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
