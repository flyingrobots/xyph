import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../../src/cli/context.js';
import { registerSearchCommands } from '../../src/cli/commands/search.js';
import { makeObservationSessionFake, makeReadPortsFromSession } from '../helpers/cliContext.js';
import { makeSnapshot, quest } from '../helpers/snapshot.js';

function makeCtx(overrides: Partial<CliContext> = {}): CliContext {
  const session = makeObservationSessionFake();
  const readPorts = makeReadPortsFromSession(session);
  return {
    agentId: 'agent.test',
    identity: { agentId: 'agent.test', source: 'default', origin: null },
    json: true,
    graphPort: {} as CliContext['graphPort'],
    observation: readPorts.observation,
    operationalRead: readPorts.operationalRead,
    inspection: readPorts.inspection,
    style: {} as CliContext['style'],
    ok: vi.fn(),
    warn: vi.fn(),
    muted: vi.fn(),
    print: vi.fn(),
    fail: vi.fn((msg: string) => {
      throw new Error(msg);
    }),
    failWithData: vi.fn((msg: string) => {
      throw new Error(msg);
    }),
    jsonOut: vi.fn(),
    jsonEvent: vi.fn(),
    jsonStart: vi.fn(),
    jsonProgress: vi.fn(),
    ...overrides,
  } as unknown as CliContext;
}

function setupSearch(
  ctx: CliContext,
  quests: ReturnType<typeof quest>[],
): Command {
  const session = makeObservationSessionFake({
    fetchSnapshot: vi.fn(async () => makeSnapshot({ quests })),
  });
  const readPorts = makeReadPortsFromSession(session);
  Object.assign(ctx, {
    observation: readPorts.observation,
    operationalRead: readPorts.operationalRead,
    inspection: readPorts.inspection,
  });

  const program = new Command();
  program.exitOverride();
  registerSearchCommands(program, ctx);
  return program;
}

const QUESTS = [
  quest({ id: 'task:mcp-api', title: 'MCP API server', status: 'BACKLOG' }),
  quest({ id: 'task:cli-search', title: 'CLI: unified search command', status: 'BACKLOG', description: 'Search quests by keyword and status' }),
  quest({ id: 'task:tui-dashboard', title: 'TUI dashboard redesign', status: 'PLANNED' }),
  quest({ id: 'task:auth-middleware', title: 'Auth middleware rewrite', status: 'IN_PROGRESS' }),
  quest({ id: 'task:old-parser', title: 'Old parser removal', status: 'GRAVEYARD', rejectionRationale: 'Superseded by tree-sitter' }),
  quest({ id: 'task:done-thing', title: 'Completed feature', status: 'DONE' }),
];

describe('search command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Keyword search ──────────────────────────────────────────────────

  describe('keyword search', () => {
    it('matches quests by title substring (case-insensitive)', async () => {
      const ctx = makeCtx();
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', 'mcp'], { from: 'user' });

      expect(ctx.jsonOut).toHaveBeenCalledOnce();
      const envelope = vi.mocked(ctx.jsonOut).mock.calls[0]?.[0];
      expect(envelope?.command).toBe('search');
      expect(envelope?.data?.['results']).toHaveLength(1);
      const results = envelope?.data?.['results'] as { id: string }[];
      expect(results?.[0]?.id).toBe('task:mcp-api');
    });

    it('matches quests by ID substring', async () => {
      const ctx = makeCtx();
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', 'tui-dash'], { from: 'user' });

      expect(ctx.jsonOut).toHaveBeenCalledOnce();
      const results = vi.mocked(ctx.jsonOut).mock.calls[0]?.[0]?.data?.['results'] as { id: string }[];
      expect(results).toHaveLength(1);
      expect(results?.[0]?.id).toBe('task:tui-dashboard');
    });

    it('matches quests by description substring', async () => {
      const ctx = makeCtx();
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', 'keyword'], { from: 'user' });

      const results = vi.mocked(ctx.jsonOut).mock.calls[0]?.[0]?.data?.['results'] as { id: string }[];
      expect(results).toHaveLength(1);
      expect(results?.[0]?.id).toBe('task:cli-search');
    });

    it('returns empty results for no match', async () => {
      const ctx = makeCtx();
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', 'nonexistent-xyz'], { from: 'user' });

      const results = vi.mocked(ctx.jsonOut).mock.calls[0]?.[0]?.data?.['results'] as { id: string }[];
      expect(results).toHaveLength(0);
    });

    it('matches multiple quests', async () => {
      const ctx = makeCtx();
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', 'cli'], { from: 'user' });

      const results = vi.mocked(ctx.jsonOut).mock.calls[0]?.[0]?.data?.['results'] as { id: string }[];
      expect(results).toHaveLength(1);
      expect(results?.[0]?.id).toBe('task:cli-search');
    });
  });

  // ── Status filter ───────────────────────────────────────────────────

  describe('status filter', () => {
    it('filters quests by single status', async () => {
      const ctx = makeCtx();
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', '--status', 'BACKLOG'], { from: 'user' });

      const results = vi.mocked(ctx.jsonOut).mock.calls[0]?.[0]?.data?.['results'] as { id: string }[];
      expect(results).toHaveLength(2);
      const ids = results?.map(r => r.id);
      expect(ids).toContain('task:mcp-api');
      expect(ids).toContain('task:cli-search');
    });

    it('filters by GRAVEYARD status (always included in search)', async () => {
      const ctx = makeCtx();
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', '--status', 'GRAVEYARD'], { from: 'user' });

      const results = vi.mocked(ctx.jsonOut).mock.calls[0]?.[0]?.data?.['results'] as { id: string }[];
      expect(results).toHaveLength(1);
      expect(results?.[0]?.id).toBe('task:old-parser');
    });

    it('combines keyword and status filter', async () => {
      const ctx = makeCtx();
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', 'rewrite', '--status', 'IN_PROGRESS'], { from: 'user' });

      const results = vi.mocked(ctx.jsonOut).mock.calls[0]?.[0]?.data?.['results'] as { id: string }[];
      expect(results).toHaveLength(1);
      expect(results?.[0]?.id).toBe('task:auth-middleware');
    });

    it('keyword + status with no intersection yields empty', async () => {
      const ctx = makeCtx();
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', 'mcp', '--status', 'DONE'], { from: 'user' });

      const results = vi.mocked(ctx.jsonOut).mock.calls[0]?.[0]?.data?.['results'] as { id: string }[];
      expect(results).toHaveLength(0);
    });
  });

  // ── Stats mode ──────────────────────────────────────────────────────

  describe('stats mode', () => {
    it('returns quest counts grouped by status', async () => {
      const ctx = makeCtx();
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', '--stats'], { from: 'user' });

      expect(ctx.jsonOut).toHaveBeenCalledOnce();
      const envelope = vi.mocked(ctx.jsonOut).mock.calls[0]?.[0];
      expect(envelope?.command).toBe('search');
      const counts = envelope?.data?.['counts'] as Record<string, number>;
      expect(counts?.['BACKLOG']).toBe(2);
      expect(counts?.['PLANNED']).toBe(1);
      expect(counts?.['IN_PROGRESS']).toBe(1);
      expect(counts?.['GRAVEYARD']).toBe(1);
      expect(counts?.['DONE']).toBe(1);
      expect(envelope?.data?.['total']).toBe(6);
    });
  });

  // ── No arguments ────────────────────────────────────────────────────

  describe('no arguments (list all)', () => {
    it('returns all quests including graveyard when no keyword or status given', async () => {
      const ctx = makeCtx();
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search'], { from: 'user' });

      const results = vi.mocked(ctx.jsonOut).mock.calls[0]?.[0]?.data?.['results'] as { id: string }[];
      expect(results).toHaveLength(6);
    });
  });

  // ── Non-JSON output ─────────────────────────────────────────────────

  describe('non-JSON output', () => {
    it('prints human-readable table rows', async () => {
      const ctx = makeCtx({ json: false });
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', 'mcp'], { from: 'user' });

      expect(ctx.ok).toHaveBeenCalled();
      expect(ctx.jsonOut).not.toHaveBeenCalled();
    });

    it('prints stats as human-readable summary', async () => {
      const ctx = makeCtx({ json: false });
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', '--stats'], { from: 'user' });

      expect(ctx.ok).toHaveBeenCalled();
      expect(ctx.jsonOut).not.toHaveBeenCalled();
    });
  });

  // ── Graveyard reason in results ─────────────────────────────────────

  describe('graveyard metadata', () => {
    it('includes rejection rationale for graveyard quests', async () => {
      const ctx = makeCtx();
      const program = setupSearch(ctx, QUESTS);

      await program.parseAsync(['search', '--status', 'GRAVEYARD'], { from: 'user' });

      const results = vi.mocked(ctx.jsonOut).mock.calls[0]?.[0]?.data?.['results'] as {
        id: string;
        rejectionRationale?: string;
      }[];
      expect(results?.[0]?.rejectionRationale).toBe('Superseded by tree-sitter');
    });
  });
});
