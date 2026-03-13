import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('server proposal-type boundary', () => {
  it('stores server mechanic suggestions as proposalType instead of final type', () => {
    const server = fs.readFileSync(new URL('../server/src/index.js', import.meta.url), 'utf8');
    expect(server).toContain('proposalType: type');
    expect(server).toContain("type: 'tap'");
  });

  it('lets chart-policy bias final mechanics from proposalType while preserving modern output', () => {
    const policy = fs.readFileSync(new URL('../chart-policy.js', import.meta.url), 'utf8');
    expect(policy).toContain('proposalMechanic');
    expect(policy).toContain("const proposal = note.proposalMechanic || 'tap'");
    expect(policy).toContain("note.type = mechanic;");
  });
});
