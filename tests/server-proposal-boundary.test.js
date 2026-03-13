import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('server proposal-type boundary', () => {
  it('stores server mechanic suggestions as proposalType instead of final type', () => {
    const server = fs.readFileSync(new URL('../server/src/index.js', import.meta.url), 'utf8');
    expect(server).toContain('proposalType: type');
    expect(server).toContain("type: 'tap'");
  });

  it('lets chart-policy use proposalType as planner input bias', () => {
    const policy = fs.readFileSync(new URL('../chart-policy.js', import.meta.url), 'utf8');
    expect(policy).toContain('const proposalType = note.proposalType');
    expect(policy).toContain('if (type === proposalType) score += 1.15;');
  });
});
