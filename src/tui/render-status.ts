import chalk from 'chalk';
import Table from 'cli-table3';
import boxen, { type Options as BoxenOptions } from 'boxen';
import type { GraphSnapshot } from '../domain/models/dashboard.js';

const STATUS_COLOR: Record<string, (s: string) => string> = {
  DONE: (s) => chalk.green(s),
  IN_PROGRESS: (s) => chalk.cyan(s),
  BACKLOG: (s) => chalk.dim(s),
  BLOCKED: (s) => chalk.red(s),
  PLANNED: (s) => chalk.yellow(s),
  PENDING: (s) => chalk.yellow(s),
  APPROVED: (s) => chalk.green(s),
  REJECTED: (s) => chalk.red(s),
  INBOX: (s) => chalk.magenta(s),
  GRAVEYARD: (s) => chalk.strikethrough(chalk.dim(s)),
};

function colorStatus(status: string): string {
  const fn = STATUS_COLOR[status];
  return fn ? fn(status) : status;
}

function snapshotHeader(label: string, detail: string, borderColor: BoxenOptions['borderColor']): string {
  return boxen(
    chalk.bold(label) + chalk.dim(`  ${detail}`),
    { padding: { top: 0, bottom: 0, left: 1, right: 1 }, borderStyle: 'single', borderColor }
  );
}

/**
 * Renders quests grouped by campaign — the Roadmap view.
 */
export function renderRoadmap(snapshot: GraphSnapshot): string {
  const lines: string[] = [];

  lines.push(snapshotHeader(
    'XYPH Roadmap',
    `snapshot at ${new Date(snapshot.asOf).toISOString()}`,
    'cyan'
  ));

  if (snapshot.quests.length === 0) {
    lines.push(chalk.dim('\n  No quests yet.'));
    return lines.join('\n');
  }

  const campaignTitle = new Map<string, string>();
  for (const c of snapshot.campaigns) {
    campaignTitle.set(c.id, c.title);
  }

  // Group quests by campaignId
  const grouped = new Map<string, typeof snapshot.quests>();
  for (const q of snapshot.quests) {
    const key = q.campaignId ?? '(no campaign)';
    const arr = grouped.get(key) ?? [];
    arr.push(q);
    grouped.set(key, arr);
  }

  for (const [key, quests] of grouped) {
    const heading = campaignTitle.get(key) ?? key;
    lines.push('');
    lines.push(chalk.bold.blue(`  ${heading}`));

    const table = new Table({
      head: [
        chalk.white('Quest'),
        chalk.white('Title'),
        chalk.white('Status'),
        chalk.white('h'),
        chalk.white('Assigned'),
      ],
      style: { head: [], border: [] },
      colWidths: [22, 44, 13, 5, 16],
    });

    for (const q of quests) {
      table.push([
        chalk.dim(q.id.slice(0, 20)),
        q.title.slice(0, 42),
        colorStatus(q.status),
        String(q.hours),
        q.assignedTo ?? '—',
      ]);
    }

    lines.push(table.toString());
  }

  return lines.join('\n');
}

/**
 * Renders the intent → quest → scroll lineage tree.
 */
export function renderLineage(snapshot: GraphSnapshot): string {
  const lines: string[] = [];

  lines.push(snapshotHeader(
    'Genealogy of Intent',
    `${snapshot.intents.length} intent(s)  ${snapshot.quests.length} quest(s)`,
    'magenta'
  ));

  if (snapshot.intents.length === 0) {
    lines.push(chalk.dim(
      '\n  No intents declared yet.\n' +
      '  xyph-actuator intent <id> --title "..." --requested-by human.<name>'
    ));
    return lines.join('\n');
  }

  const scrollByQuestId = new Map<string, { id: string; hasSeal: boolean }>();
  for (const s of snapshot.scrolls) {
    scrollByQuestId.set(s.questId, { id: s.id, hasSeal: s.hasSeal });
  }

  const questsByIntent = new Map<string, typeof snapshot.quests>();
  for (const q of snapshot.quests) {
    if (q.intentId !== undefined) {
      const arr = questsByIntent.get(q.intentId) ?? [];
      arr.push(q);
      questsByIntent.set(q.intentId, arr);
    }
  }

  // Collect orphan quests (no intentId)
  // INBOX tasks genuinely lack an intent (not yet promoted) — exclude from orphan list
  const orphans = snapshot.quests.filter(
    (q) => q.intentId === undefined && q.status !== 'INBOX'
  );

  for (const intent of snapshot.intents) {
    lines.push('');
    lines.push(
      chalk.bold.magenta(`  ◆ ${intent.id}`) +
      chalk.dim(`  ${intent.title}`)
    );
    lines.push(chalk.dim(`     requested-by: ${intent.requestedBy}`));

    const quests = questsByIntent.get(intent.id) ?? [];
    if (quests.length === 0) {
      lines.push(chalk.dim('     └─ (no quests)'));
      continue;
    }

    for (let i = 0; i < quests.length; i++) {
      const q = quests[i];
      if (!q) continue;
      const isLast = i === quests.length - 1;
      const branch = isLast ? '└─' : '├─';
      const scrollEntry = scrollByQuestId.get(q.id);
      const scrollMark = scrollEntry !== undefined
        ? (scrollEntry.hasSeal ? chalk.green(' ✓') : chalk.yellow(' ○'))
        : '';

      lines.push(
        `     ${branch} ${chalk.dim(q.id)}  ${q.title.slice(0, 38)}  [${colorStatus(q.status)}]${scrollMark}`
      );

      if (scrollEntry !== undefined) {
        const indent = isLast ? '   ' : '│  ';
        lines.push(
          `     ${indent}  ${chalk.dim('scroll:')} ${chalk.dim(scrollEntry.id)}`
        );
      }
    }
  }

  if (orphans.length > 0) {
    lines.push('');
    lines.push(chalk.bold.red('  ⚠ Orphan quests (no intent — Constitution violation)'));
    for (let i = 0; i < orphans.length; i++) {
      const q = orphans[i];
      if (!q) continue;
      const branch = i === orphans.length - 1 ? '└─' : '├─';
      lines.push(`     ${branch} ${chalk.dim(q.id)}  ${q.title.slice(0, 38)}  [${colorStatus(q.status)}]`);
    }
  }

  return lines.join('\n');
}

/**
 * Renders all nodes in separate tables — the All Nodes view.
 */
export function renderAll(snapshot: GraphSnapshot): string {
  const lines: string[] = [];
  const total =
    snapshot.campaigns.length +
    snapshot.quests.length +
    snapshot.intents.length +
    snapshot.scrolls.length +
    snapshot.approvals.length;

  lines.push(snapshotHeader('All WARP Nodes', `${total} node(s) total`, 'green'));

  if (snapshot.campaigns.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Campaigns / Milestones'));
    const t = new Table({
      head: [chalk.white('ID'), chalk.white('Title'), chalk.white('Status')],
      style: { head: [], border: [] },
    });
    for (const c of snapshot.campaigns) {
      t.push([chalk.dim(c.id), c.title, colorStatus(c.status)]);
    }
    lines.push(t.toString());
  }

  if (snapshot.intents.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Intents'));
    const t = new Table({
      head: [
        chalk.white('ID'),
        chalk.white('Title'),
        chalk.white('Requested By'),
        chalk.white('Created'),
      ],
      style: { head: [], border: [] },
    });
    for (const intent of snapshot.intents) {
      t.push([
        chalk.dim(intent.id),
        intent.title.slice(0, 40),
        intent.requestedBy,
        new Date(intent.createdAt).toLocaleDateString(),
      ]);
    }
    lines.push(t.toString());
  }

  if (snapshot.quests.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Quests'));
    const t = new Table({
      head: [
        chalk.white('ID'),
        chalk.white('Title'),
        chalk.white('Status'),
        chalk.white('h'),
        chalk.white('Campaign'),
        chalk.white('Scroll'),
      ],
      style: { head: [], border: [] },
    });
    for (const q of snapshot.quests) {
      t.push([
        chalk.dim(q.id),
        q.title.slice(0, 35),
        colorStatus(q.status),
        String(q.hours),
        q.campaignId ?? '—',
        q.scrollId ? chalk.green('✓') : '—',
      ]);
    }
    lines.push(t.toString());
  }

  if (snapshot.scrolls.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Scrolls'));
    const t = new Table({
      head: [
        chalk.white('ID'),
        chalk.white('Quest'),
        chalk.white('Sealed By'),
        chalk.white('Date'),
        chalk.white('Guild Seal'),
      ],
      style: { head: [], border: [] },
    });
    for (const s of snapshot.scrolls) {
      t.push([
        chalk.dim(s.id),
        s.questId,
        s.sealedBy,
        new Date(s.sealedAt).toLocaleDateString(),
        s.hasSeal ? chalk.green('⊕') : chalk.yellow('○'),
      ]);
    }
    lines.push(t.toString());
  }

  if (snapshot.approvals.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Approval Gates'));
    const t = new Table({
      head: [
        chalk.white('ID'),
        chalk.white('Status'),
        chalk.white('Trigger'),
        chalk.white('Approver'),
        chalk.white('Requester'),
      ],
      style: { head: [], border: [] },
    });
    for (const a of snapshot.approvals) {
      t.push([chalk.dim(a.id), colorStatus(a.status), a.trigger, a.approver, a.requestedBy]);
    }
    lines.push(t.toString());
  }

  return lines.join('\n');
}

/**
 * Renders INBOX tasks grouped by suggested_by — the Intake view.
 * GRAVEYARD tasks are never shown here; use renderAll with --include-graveyard for those.
 */
export function renderInbox(snapshot: GraphSnapshot): string {
  const lines: string[] = [];
  const inbox = snapshot.quests.filter((q) => q.status === 'INBOX');

  lines.push(snapshotHeader(
    'Intake INBOX',
    `${inbox.length} task(s) awaiting triage`,
    'magenta'
  ));

  if (inbox.length === 0) {
    lines.push(chalk.dim(
      '\n  No tasks in INBOX.\n' +
      '  Add one: xyph-actuator inbox task:ID --title "..." --suggested-by <principal>'
    ));
    return lines.join('\n');
  }

  const bySuggester = new Map<string, typeof inbox>();
  for (const q of inbox) {
    const key = q.suggestedBy ?? '(unknown suggester)';
    const arr = bySuggester.get(key) ?? [];
    arr.push(q);
    bySuggester.set(key, arr);
  }

  for (const [suggester, quests] of bySuggester) {
    lines.push('');
    lines.push(chalk.bold.magenta(`  ${suggester}`));

    const t = new Table({
      head: [
        chalk.white('ID'),
        chalk.white('Title'),
        chalk.white('h'),
        chalk.white('Suggested'),
        chalk.white('Prev rejection'),
      ],
      style: { head: [], border: [] },
    });

    for (const q of quests) {
      const suggestedAt = q.suggestedAt !== undefined
        ? new Date(q.suggestedAt).toLocaleDateString()
        : '—';
      const prevRej = q.rejectionRationale !== undefined
        ? chalk.dim(q.rejectionRationale.slice(0, 24) + (q.rejectionRationale.length > 24 ? '…' : ''))
        : '—';

      t.push([chalk.dim(q.id), q.title.slice(0, 38), String(q.hours), suggestedAt, prevRej]);
    }

    lines.push(t.toString());
  }

  return lines.join('\n');
}
