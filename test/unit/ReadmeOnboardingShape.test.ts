import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('README onboarding shape', () => {
  const readmePath = path.resolve(process.cwd(), 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');

  it('introduces Xyph with a quick-start section before documentation', () => {
    const sectionOrder = [
      '## Why Xyph?',
      '## Quick Start',
      '## Documentation',
    ];

    let previousIndex = -1;
    for (const heading of sectionOrder) {
      const index = readme.indexOf(heading);
      expect(index, `missing heading: ${heading}`).toBeGreaterThanOrEqual(0);
      expect(index, `heading out of order: ${heading}`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  });

  it('does not lead with the older slogan-heavy opening', () => {
    expect(readme).not.toContain('### xyph (verb)');
    expect(readme).not.toContain('<h3>Reificatory Engine</h3>');
    expect(readme).not.toContain('No server. No database. Just Git.');
  });

  it('contains a truthful first-use flow', () => {
    expect(readme).toContain('npx tsx xyph-actuator.ts intent intent:setup');
    expect(readme).toContain('npx tsx xyph-actuator.ts quest task:docs-001');
    expect(readme).toContain('--intent intent:setup');
  });
});
