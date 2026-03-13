const payload = {
  payload: {
    schema: 'rgb-grid-review.v1',
    chart: {
      noteCount: 12,
      durationSec: 24,
      openingSeconds: 12,
      windows: [
        { start: 0, end: 8, count: 5, taps: 2, sustain: 3, accents: 0, geometry: 0 },
        { start: 8, end: 16, count: 4, taps: 2, sustain: 1, accents: 1, geometry: 1 }
      ],
      segments: []
    },
    audit: {
      mechanic: { tapRatio: 0.54, latterSpecialRatio: 0.22 },
      spatial: { avgLaneJump: 1.34, largeJumpCount: 4, directionReversalCount: 3 },
      geometry: { geometryRatio: 0.18, geometryCount: 1, runtimeVisibleRatio: 0.5 }
    },
    diagnostics: {}
  }
};

const res = await fetch('http://127.0.0.1:8787/api/chart-review', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});
console.log(await res.text());
