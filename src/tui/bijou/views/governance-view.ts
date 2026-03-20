import { flex, navigableTable, createPagerState, pagerScrollTo, pager } from '@flyingrobots/bijou-tui';
import type {
  GovernanceArtifactNode,
  GovernanceAttestationSummary,
} from '../../../domain/models/dashboard.js';
import type { StylePort } from '../../../ports/StylePort.js';
import { formatAge, sliceDate } from '../../view-helpers.js';
import type { DashboardModel } from '../DashboardApp.js';
import { sortedGovernanceArtifacts } from '../selection-order.js';

function shortWorldline(id: string | undefined): string {
  if (!id) return 'unknown';
  return id.replace(/^worldline:/, '');
}

function shortId(id: string | undefined): string {
  if (!id) return '—';
  return id.replace(/^(comparison-artifact:|collapse-proposal:|attestation:|task:|worldline:)/, '');
}

function attestationSummary(summary: GovernanceAttestationSummary): string {
  if (summary.total === 0) return '0 attest';
  return `${summary.approvals}/${summary.total} approve`;
}

function renderSummaryBand(style: StylePort, artifacts: GovernanceArtifactNode[]): string {
  const freshComparisons = artifacts.filter((artifact) =>
    artifact.type === 'comparison-artifact'
    && artifact.governance.freshness === 'fresh'
    && artifact.governance.series.latestInSeries,
  ).length;
  const pendingSettlement = artifacts.filter((artifact) =>
    artifact.type === 'collapse-proposal' && artifact.governance.lifecycle === 'pending_attestation',
  ).length;
  const approvedSettlement = artifacts.filter((artifact) =>
    artifact.type === 'collapse-proposal' && artifact.governance.lifecycle === 'approved',
  ).length;
  const staleArtifacts = artifacts.filter((artifact) =>
    artifact.type === 'comparison-artifact'
      ? artifact.governance.freshness === 'stale'
      : artifact.type === 'collapse-proposal'
        ? artifact.governance.freshness === 'stale'
        : false,
  ).length;
  const executedSettlement = artifacts.filter((artifact) =>
    artifact.type === 'collapse-proposal' && artifact.governance.lifecycle === 'executed',
  ).length;

  return [
    style.styled(style.theme.semantic.primary, ` fresh cmp ${freshComparisons}`),
    style.styled(style.theme.semantic.warning, ` pending ${pendingSettlement}`),
    style.styled(style.theme.semantic.success, ` approved ${approvedSettlement}`),
    style.styled(style.theme.semantic.warning, ` stale ${staleArtifacts}`),
    style.styled(style.theme.semantic.info, ` executed ${executedSettlement}`),
  ].join('  ');
}

function renderComparisonDetail(style: StylePort, artifact: Extract<GovernanceArtifactNode, { type: 'comparison-artifact' }>): string {
  const lines: string[] = [];
  lines.push(style.styled(style.theme.semantic.primary, ` ${artifact.id}`));
  lines.push('');
  lines.push(` Lane:       ${shortWorldline(artifact.leftWorldlineId)} -> ${shortWorldline(artifact.rightWorldlineId)}`);
  if (artifact.targetId) lines.push(` Target:     ${artifact.targetId}`);
  lines.push(` Freshness:  ${artifact.governance.freshness}`);
  lines.push(` Attest:     ${artifact.governance.attestation.state} (${attestationSummary(artifact.governance.attestation)})`);
  lines.push(` Series:     ${artifact.governance.series.latestInSeries ? 'latest' : 'superseded'}`);
  if (artifact.governance.series.supersedesId) lines.push(` Supersedes: ${artifact.governance.series.supersedesId}`);
  if (artifact.governance.series.supersededByIds.length > 0) {
    lines.push(` Newer:      ${artifact.governance.series.supersededByIds.map(shortId).join(', ')}`);
  }
  lines.push(` Proposals:  ${artifact.governance.settlement.proposalCount}`);
  lines.push(` Executed:   ${artifact.governance.settlement.executedCount}`);
  if (artifact.governance.settlement.latestProposalId) {
    lines.push(` Latest:     ${artifact.governance.settlement.latestProposalId}`);
  }
  if (artifact.governance.comparison.operationalComparisonDigest) {
    lines.push(` Op digest:  ${artifact.governance.comparison.operationalComparisonDigest.slice(0, 20)}...`);
  }
  if (artifact.governance.comparison.rawComparisonDigest) {
    lines.push(` Raw digest: ${artifact.governance.comparison.rawComparisonDigest.slice(0, 20)}...`);
  }
  return lines.join('\n');
}

function renderCollapseDetail(style: StylePort, artifact: Extract<GovernanceArtifactNode, { type: 'collapse-proposal' }>): string {
  const lines: string[] = [];
  lines.push(style.styled(style.theme.semantic.primary, ` ${artifact.id}`));
  lines.push('');
  lines.push(` Lane:       ${shortWorldline(artifact.sourceWorldlineId)} => ${shortWorldline(artifact.targetWorldlineId)}`);
  lines.push(` Lifecycle:  ${artifact.governance.lifecycle}`);
  lines.push(` Freshness:  ${artifact.governance.freshness}`);
  lines.push(` Attest:     ${artifact.governance.attestation.state} (${attestationSummary(artifact.governance.attestation)})`);
  lines.push(` Exec gate:  ${artifact.governance.executionGate.attestation.state} (${attestationSummary(artifact.governance.executionGate.attestation)})`);
  lines.push(` Dry run:    ${artifact.governance.execution.dryRun ? 'yes' : 'no'}`);
  lines.push(` Executable: ${artifact.governance.execution.executable ? 'yes' : 'no'}`);
  lines.push(` Changed:    ${artifact.governance.execution.changed ? 'yes' : 'no'}`);
  lines.push(` Executed:   ${artifact.governance.execution.executed ? 'yes' : 'no'}`);
  if (artifact.comparisonArtifactId) lines.push(` Compare:    ${artifact.comparisonArtifactId}`);
  if (artifact.governance.series.supersedesId) lines.push(` Supersedes: ${artifact.governance.series.supersedesId}`);
  if (artifact.governance.execution.executionPatch) {
    lines.push(` Patch:      ${artifact.governance.execution.executionPatch}`);
  }
  return lines.join('\n');
}

function renderAttestationDetail(style: StylePort, artifact: Extract<GovernanceArtifactNode, { type: 'attestation' }>): string {
  const lines: string[] = [];
  lines.push(style.styled(style.theme.semantic.primary, ` ${artifact.id}`));
  lines.push('');
  lines.push(` Decision:   ${artifact.governance.decision ?? 'unknown'}`);
  lines.push(` Target:     ${artifact.targetId ?? '—'}`);
  lines.push(` Target type:${artifact.governance.targetType ?? '—'}`);
  lines.push(` Exists:     ${artifact.governance.targetExists ? 'yes' : 'no'}`);
  return lines.join('\n');
}

function renderDetail(style: StylePort, artifact: GovernanceArtifactNode | undefined): string {
  if (!artifact) {
    return style.styled(style.theme.semantic.muted, '  Select a governance artifact to inspect its freshness, lane state, and execution gate.');
  }

  const lines: string[] = [];
  lines.push(style.styled(style.theme.semantic.muted, ` Recorded ${sliceDate(artifact.recordedAt)} · ${formatAge(artifact.recordedAt)} ago`));
  if (artifact.recordedBy) {
    lines.push(style.styled(style.theme.semantic.muted, ` By ${artifact.recordedBy}`));
  }
  lines.push('');

  switch (artifact.type) {
    case 'comparison-artifact':
      lines.push(renderComparisonDetail(style, artifact));
      break;
    case 'collapse-proposal':
      lines.push(renderCollapseDetail(style, artifact));
      break;
    case 'attestation':
      lines.push(renderAttestationDetail(style, artifact));
      break;
  }

  return lines.join('\n');
}

export function governanceView(model: DashboardModel, style: StylePort, width?: number, height?: number): string {
  const w = width ?? model.cols;
  const h = height ?? (model.rows - 3);
  const snap = model.snapshot;
  if (!snap) return style.styled(style.theme.semantic.muted, '  No snapshot loaded.');

  const artifacts = sortedGovernanceArtifacts(snap);
  if (artifacts.length === 0) {
    return [
      style.styled(style.theme.semantic.primary, ' Governance'),
      '',
      style.styled(style.theme.semantic.muted, '  No comparison-artifact, collapse-proposal, or attestation records are visible yet.'),
      style.styled(style.theme.semantic.muted, '  Persist a compare/collapse lane from `xyph api` and it will show up here.'),
    ].join('\n');
  }

  const selected = artifacts[model.governance.table.focusRow];
  const leftWidth = Math.max(48, Math.floor(w * 0.42));

  function renderList(_pw: number, _ph: number): string {
    const lines: string[] = [];
    lines.push(style.styled(style.theme.semantic.primary, ` Governance (${artifacts.length})`));
    lines.push('');
    lines.push(renderSummaryBand(style, artifacts));
    lines.push('');
    lines.push(navigableTable(model.governance.table, {
      focusIndicator: style.styled(style.theme.semantic.primary, '\u25B6'),
    }));
    return lines.join('\n');
  }

  function renderInspector(pw: number, ph: number): string {
    const content = renderDetail(style, selected);
    let pagerState = createPagerState({ content, width: pw, height: ph });
    pagerState = pagerScrollTo(pagerState, model.governance.detailScrollY);
    return pager(pagerState);
  }

  return flex(
    { direction: 'row', width: w, height: h },
    { basis: leftWidth, content: renderList },
    { flex: 1, content: renderInspector },
  );
}
