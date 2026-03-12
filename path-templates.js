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

  function chooseTemplate(note, difficulty = 'normal') {
    const seq = Math.abs(Number(note?.noteNumber || 0));
    if (difficulty === 'hard') {
      if (seq % 5 === 0) return 'starTrace';
      if (seq % 2 === 0) return 'diamondLoop';
      return 'orbit';
    }
    if (difficulty === 'normal') {
      if (seq % 3 === 0) return 'diamondLoop';
      return 'orbit';
    }
    return 'orbit';
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
