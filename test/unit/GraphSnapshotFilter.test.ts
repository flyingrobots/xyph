// @xyph criterion:lineage-status-legend
// @xyph criterion:status-backlog-filter
// @xyph criterion:status-raw-status-flag

import { describe, expect, it } from 'vitest';
import { filterGraphSnapshot } from '../../src/domain/services/GraphSnapshotFilter.js';
import { renderLineage } from '../../src/tui/render-status.js';
import { createPlainStylePort, ensurePlainBijouContext } from '../../src/infrastructure/adapters/PlainStyleAdapter.js';
import { makeSnapshot, quest, intent, scroll } from '../helpers/snapshot.js';
import { strip } from '../helpers/ansi.js';

ensurePlainBijouContext();

describe('filterGraphSnapshot', () => {
  it('filters out GRAVEYARD quests by default', () => {
    const snap = makeSnapshot({
      quests: [
        quest({ id: 'task:1', title: 'Task 1', status: 'PLANNED' }),
        quest({ id: 'task:2', title: 'Task 2', status: 'GRAVEYARD' }),
      ],
    });
    const result = filterGraphSnapshot(snap, { includeGraveyard: false });
    expect(result.quests).toHaveLength(1);
    expect(result.quests[0]?.id).toBe('task:1');
  });

  it('preserves GRAVEYARD quests when includeGraveyard is true', () => {
    const snap = makeSnapshot({
      quests: [
        quest({ id: 'task:1', title: 'Task 1', status: 'PLANNED' }),
        quest({ id: 'task:2', title: 'Task 2', status: 'GRAVEYARD' }),
      ],
    });
    const result = filterGraphSnapshot(snap, { includeGraveyard: true });
    expect(result.quests).toHaveLength(2);
  });

  it('supports rawStatus filtering option', () => {
    const snap = makeSnapshot({
      quests: [
        quest({ id: 'task:1', title: 'Task 1', status: 'BACKLOG', rawStatus: 'INBOX' }),
      ],
    });
    const result = filterGraphSnapshot(snap, { includeGraveyard: false, rawStatus: true });
    expect(result.quests).toHaveLength(1);
    expect(result.quests[0]?.status).toBe('INBOX');
  });

  it('supports backlogOnly filtering option', () => {
    const snap = makeSnapshot({
      quests: [
        quest({ id: 'task:1', title: 'Task 1', status: 'BACKLOG' }),
        quest({ id: 'task:2', title: 'Task 2', status: 'PLANNED' }),
      ],
    });
    const result = filterGraphSnapshot(snap, { includeGraveyard: false, backlogOnly: true });
    expect(result.quests).toHaveLength(1);
    expect(result.quests[0]?.id).toBe('task:1');
  });
});

describe('renderLineage', () => {
  it('renders the lineage tree along with the status legend', () => {
    const style = createPlainStylePort();
    const snap = makeSnapshot({
      intents: [intent({ id: 'intent:1', title: 'Intent 1' })],
      quests: [quest({ id: 'task:1', title: 'Quest 1', intentId: 'intent:1', status: 'IN_PROGRESS' })],
      scrolls: [scroll({ id: 'scroll:1', questId: 'task:1' })],
    });
    const output = strip(renderLineage(snap, style));
    expect(output).toContain('Genealogy of Intent');
    expect(output).toContain('Legend: ✓ sealed scroll  ○ unsealed scroll');
    expect(output).toContain('intent:1');
    expect(output).toContain('task:1');
  });
});
