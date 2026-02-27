import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _resetThemeForTesting } from '@flyingrobots/bijou';
import { ensureXyphContext, _resetBridgeForTesting } from '../../theme/bridge.js';
import type { DashboardModel } from '../DashboardApp.js';
import type { GraphSnapshot, QuestNode, IntentNode, CampaignNode } from '../../../domain/models/dashboard.js';
import { roadmapView } from '../views/roadmap-view.js';
import { lineageView } from '../views/lineage-view.js';
import { allView } from '../views/all-view.js';
import { inboxView } from '../views/inbox-view.js';

// ── Helpers ────────────────────────────────────────────────────────────

/** Strip ANSI escape codes for assertion matching. */
const ANSI_RE = new RegExp(String.fromCharCode(0x1b) + '\\[[0-9;]*m', 'g');
function strip(s: string): string {
  return s.replace(ANSI_RE, '');
}

function makeSnapshot(overrides?: Partial<GraphSnapshot>): GraphSnapshot {
  return {
    campaigns: [],
    quests: [],
    intents: [],
    scrolls: [],
    approvals: [],
    submissions: [],
    reviews: [],
    decisions: [],
    asOf: Date.now(),
    ...overrides,
  };
}

function makeModel(snapshot: GraphSnapshot | null): DashboardModel {
  return {
    activeView: 'roadmap',
    snapshot,
    loading: false,
    error: null,
    showLanding: false,
    showHelp: false,
    cols: 120,
    rows: 40,
    logoText: 'XYPH',
    requestId: 1,
  };
}

function quest(overrides: Partial<QuestNode> & { id: string; title: string }): QuestNode {
  return {
    status: 'PLANNED',
    hours: 2,
    ...overrides,
  };
}

function intent(overrides: Partial<IntentNode> & { id: string; title: string }): IntentNode {
  return {
    requestedBy: 'human.james',
    createdAt: Date.now(),
    ...overrides,
  };
}

function campaign(overrides: Partial<CampaignNode> & { id: string; title: string }): CampaignNode {
  return {
    status: 'IN_PROGRESS',
    ...overrides,
  };
}

// ── Setup / teardown ───────────────────────────────────────────────────

describe('bijou views', () => {
  beforeEach(() => {
    _resetThemeForTesting();
    _resetBridgeForTesting();
    delete process.env['NO_COLOR'];
    delete process.env['XYPH_THEME'];
    vi.stubEnv('NO_COLOR', '1');
    ensureXyphContext();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetThemeForTesting();
    _resetBridgeForTesting();
  });

// ── Roadmap View ───────────────────────────────────────────────────────

describe('roadmapView', () => {
  it('returns muted text when snapshot is null', () => {
    const out = roadmapView(makeModel(null));
    expect(strip(out)).toContain('No snapshot loaded');
  });

  it('shows empty message when no quests', () => {
    const out = roadmapView(makeModel(makeSnapshot()));
    const plain = strip(out);
    expect(plain).toContain('XYPH Roadmap');
    expect(plain).toContain('No quests yet');
  });

  it('renders quests grouped by campaign', () => {
    const snap = makeSnapshot({
      campaigns: [campaign({ id: 'campaign:M1', title: 'Milestone 1' })],
      quests: [
        quest({ id: 'task:A-001', title: 'First quest', campaignId: 'campaign:M1', status: 'DONE', hours: 3, assignedTo: 'agent.james' }),
        quest({ id: 'task:A-002', title: 'Second quest', campaignId: 'campaign:M1', status: 'IN_PROGRESS' }),
      ],
    });
    const plain = strip(roadmapView(makeModel(snap)));
    expect(plain).toContain('Milestone 1');
    expect(plain).toContain('task:A-001');
    expect(plain).toContain('First quest');
    expect(plain).toContain('DONE');
    expect(plain).toContain('agent.james');
    expect(plain).toContain('task:A-002');
  });

  it('shows (no campaign) for quests without campaignId', () => {
    const snap = makeSnapshot({
      quests: [quest({ id: 'task:X-001', title: 'Orphan quest' })],
    });
    const plain = strip(roadmapView(makeModel(snap)));
    expect(plain).toContain('(no campaign)');
  });
});

// ── Inbox View ─────────────────────────────────────────────────────────

describe('inboxView', () => {
  it('returns muted text when snapshot is null', () => {
    const out = inboxView(makeModel(null));
    expect(strip(out)).toContain('No snapshot loaded');
  });

  it('shows empty message when inbox is empty', () => {
    const snap = makeSnapshot({
      quests: [quest({ id: 'task:Q-001', title: 'Not inbox', status: 'PLANNED' })],
    });
    const plain = strip(inboxView(makeModel(snap)));
    expect(plain).toContain('Intake INBOX');
    expect(plain).toContain('No tasks in INBOX');
  });

  it('groups inbox quests by suggestedBy', () => {
    const snap = makeSnapshot({
      quests: [
        quest({ id: 'task:I-001', title: 'Task from agent', status: 'INBOX', suggestedBy: 'agent.claude', suggestedAt: Date.now() }),
        quest({ id: 'task:I-002', title: 'Task from human', status: 'INBOX', suggestedBy: 'human.james', suggestedAt: Date.now() }),
        quest({ id: 'task:I-003', title: 'Another from agent', status: 'INBOX', suggestedBy: 'agent.claude' }),
      ],
    });
    const plain = strip(inboxView(makeModel(snap)));
    expect(plain).toContain('agent.claude');
    expect(plain).toContain('human.james');
    expect(plain).toContain('task:I-001');
    expect(plain).toContain('task:I-002');
    expect(plain).toContain('task:I-003');
  });

  it('truncates long rejection rationale', () => {
    const snap = makeSnapshot({
      quests: [
        quest({
          id: 'task:I-010',
          title: 'Rejected once',
          status: 'INBOX',
          suggestedBy: 'agent.claude',
          rejectionRationale: 'This was rejected because the scope was way too large for a single quest',
        }),
      ],
    });
    const plain = strip(inboxView(makeModel(snap)));
    // 24 chars + ellipsis
    expect(plain).toContain('This was rejected becau');
    expect(plain).toContain('\u2026');
  });

  it('shows unknown suggester fallback', () => {
    const snap = makeSnapshot({
      quests: [quest({ id: 'task:I-020', title: 'Mystery task', status: 'INBOX' })],
    });
    const plain = strip(inboxView(makeModel(snap)));
    expect(plain).toContain('(unknown suggester)');
  });
});

// ── All View ───────────────────────────────────────────────────────────

describe('allView', () => {
  it('returns muted text when snapshot is null', () => {
    const out = allView(makeModel(null));
    expect(strip(out)).toContain('No snapshot loaded');
  });

  it('shows node count in header', () => {
    const snap = makeSnapshot({
      campaigns: [campaign({ id: 'campaign:M1', title: 'M1' })],
      quests: [quest({ id: 'task:Q-001', title: 'Q1' })],
      intents: [intent({ id: 'intent:SOV', title: 'Sovereignty' })],
    });
    const plain = strip(allView(makeModel(snap)));
    expect(plain).toContain('3 node(s) total');
  });

  it('shows all sections when populated', () => {
    const snap = makeSnapshot({
      campaigns: [campaign({ id: 'campaign:M1', title: 'Milestone 1' })],
      quests: [quest({ id: 'task:Q-001', title: 'Quest one', scrollId: 'artifact:task:Q-001' })],
      intents: [intent({ id: 'intent:SOV', title: 'Sovereignty' })],
      scrolls: [{ id: 'artifact:task:Q-001', questId: 'task:Q-001', artifactHash: 'abc', sealedBy: 'agent.james', sealedAt: Date.now(), hasSeal: true }],
      approvals: [{ id: 'approval:A-001', status: 'APPROVED', trigger: 'CRITICAL_PATH_CHANGE', approver: 'human.james', requestedBy: 'agent.claude' }],
    });
    const plain = strip(allView(makeModel(snap)));
    expect(plain).toContain('Campaigns / Milestones');
    expect(plain).toContain('Intents');
    expect(plain).toContain('Quests');
    expect(plain).toContain('Scrolls');
    expect(plain).toContain('Approval Gates');
    expect(plain).toContain('\u2713'); // scroll check mark
    expect(plain).toContain('\u2295'); // guild seal mark
  });

  it('omits empty sections', () => {
    const snap = makeSnapshot({
      quests: [quest({ id: 'task:Q-001', title: 'Solo quest' })],
    });
    const plain = strip(allView(makeModel(snap)));
    expect(plain).toContain('Quests');
    expect(plain).not.toContain('Campaigns');
    expect(plain).not.toContain('Intents');
    expect(plain).not.toContain('Scrolls');
    expect(plain).not.toContain('Approval Gates');
  });
});

// ── Lineage View ───────────────────────────────────────────────────────

describe('lineageView', () => {
  it('returns muted text when snapshot is null', () => {
    const out = lineageView(makeModel(null));
    expect(strip(out)).toContain('No snapshot loaded');
  });

  it('shows empty message when no intents', () => {
    const plain = strip(lineageView(makeModel(makeSnapshot())));
    expect(plain).toContain('Genealogy of Intent');
    expect(plain).toContain('No intents declared yet');
  });

  it('renders intent with child quests', () => {
    const snap = makeSnapshot({
      intents: [intent({ id: 'intent:SOV', title: 'Sovereignty' })],
      quests: [
        quest({ id: 'task:SOV-001', title: 'First sovereignty quest', intentId: 'intent:SOV', status: 'DONE' }),
        quest({ id: 'task:SOV-002', title: 'Second quest', intentId: 'intent:SOV', status: 'IN_PROGRESS' }),
      ],
    });
    const plain = strip(lineageView(makeModel(snap)));
    expect(plain).toContain('\u25C6 intent:SOV');
    expect(plain).toContain('Sovereignty');
    expect(plain).toContain('task:SOV-001');
    expect(plain).toContain('DONE');
    expect(plain).toContain('task:SOV-002');
  });

  it('shows (no quests) for intent without children', () => {
    const snap = makeSnapshot({
      intents: [intent({ id: 'intent:EMPTY', title: 'Empty intent' })],
    });
    const plain = strip(lineageView(makeModel(snap)));
    expect(plain).toContain('(no quests)');
  });

  it('shows scroll marks for quests with scrolls', () => {
    const snap = makeSnapshot({
      intents: [intent({ id: 'intent:SOV', title: 'Sovereignty' })],
      quests: [
        quest({ id: 'task:SOV-001', title: 'Sealed quest', intentId: 'intent:SOV', status: 'DONE' }),
      ],
      scrolls: [{ id: 'artifact:task:SOV-001', questId: 'task:SOV-001', artifactHash: 'abc', sealedBy: 'agent.james', sealedAt: Date.now(), hasSeal: true }],
    });
    const plain = strip(lineageView(makeModel(snap)));
    expect(plain).toContain('\u2713'); // sealed scroll mark
    expect(plain).toContain('scroll:');
    expect(plain).toContain('artifact:task:SOV-001');
  });

  it('shows unsealed scroll as circle', () => {
    const snap = makeSnapshot({
      intents: [intent({ id: 'intent:SOV', title: 'Sovereignty' })],
      quests: [
        quest({ id: 'task:SOV-001', title: 'Unsealed quest', intentId: 'intent:SOV' }),
      ],
      scrolls: [{ id: 'artifact:task:SOV-001', questId: 'task:SOV-001', artifactHash: 'abc', sealedBy: 'agent.james', sealedAt: Date.now(), hasSeal: false }],
    });
    const plain = strip(lineageView(makeModel(snap)));
    expect(plain).toContain('\u25CB'); // unsealed scroll mark
  });

  it('renders orphan quests section (excludes INBOX)', () => {
    const snap = makeSnapshot({
      intents: [intent({ id: 'intent:SOV', title: 'Sovereignty' })],
      quests: [
        quest({ id: 'task:ORPHAN-001', title: 'Orphan quest', status: 'PLANNED' }),
        quest({ id: 'task:INBOX-001', title: 'Inbox task', status: 'INBOX' }),
      ],
    });
    const plain = strip(lineageView(makeModel(snap)));
    expect(plain).toContain('Orphan quests');
    expect(plain).toContain('task:ORPHAN-001');
    // INBOX tasks should NOT appear in orphan section
    expect(plain).not.toContain('task:INBOX-001');
  });
});
}); // bijou views
