import { describe, it, expect } from 'vitest';
import { createObservedGraphProjection } from '../../src/infrastructure/ObservedGraphProjection.js';
import { makeSnapshot, quest } from '../helpers/snapshot.js';
import type { GraphPort } from '../../src/ports/GraphPort.js';
import type { WarpCore as WarpGraph } from '@git-stunts/git-warp';

/** Stub GraphPort — filterSnapshot never touches the graph. */
const stubGraphPort: GraphPort = {
  getGraph: () => Promise.resolve({} as WarpGraph),
};

describe('filterSnapshot — transitiveDownstream', () => {
  const ctx = createObservedGraphProjection(stubGraphPort);

  it('strips GRAVEYARD task keys from transitiveDownstream', () => {
    const snap = makeSnapshot({
      quests: [
        quest({ id: 'task:A', title: 'Alive', status: 'PLANNED' }),
        quest({ id: 'task:B', title: 'Dead', status: 'GRAVEYARD' }),
        quest({ id: 'task:C', title: 'Done', status: 'DONE' }),
      ],
      transitiveDownstream: new Map([
        ['task:A', 2],
        ['task:B', 1],  // GRAVEYARD — should be removed
        ['task:C', 0],  // DONE — kept (filterSnapshot doesn't strip DONE)
      ]),
    });

    const filtered = ctx.filterSnapshot(snap, { includeGraveyard: false });

    expect(filtered.transitiveDownstream.has('task:A')).toBe(true);
    expect(filtered.transitiveDownstream.has('task:B')).toBe(false);
    expect(filtered.transitiveDownstream.has('task:C')).toBe(true);
    expect(filtered.transitiveDownstream.get('task:A')).toBe(2);
  });

  it('preserves transitiveDownstream when includeGraveyard is true', () => {
    const downstream = new Map([['task:A', 3], ['task:B', 1]]);
    const snap = makeSnapshot({
      quests: [
        quest({ id: 'task:A', title: 'Alive', status: 'PLANNED' }),
        quest({ id: 'task:B', title: 'Dead', status: 'GRAVEYARD' }),
      ],
      transitiveDownstream: downstream,
    });

    const filtered = ctx.filterSnapshot(snap, { includeGraveyard: true });

    expect(filtered.transitiveDownstream).toBe(downstream); // same reference
  });

  it('returns empty map when all tasks are GRAVEYARD', () => {
    const snap = makeSnapshot({
      quests: [
        quest({ id: 'task:A', title: 'Dead', status: 'GRAVEYARD' }),
      ],
      transitiveDownstream: new Map([['task:A', 5]]),
    });

    const filtered = ctx.filterSnapshot(snap, { includeGraveyard: false });

    expect(filtered.transitiveDownstream.size).toBe(0);
    expect(filtered.quests).toHaveLength(0);
  });
});
