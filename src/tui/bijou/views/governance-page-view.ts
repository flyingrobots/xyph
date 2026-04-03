import { stepper } from '@flyingrobots/bijou';
import { createPagerState, pager, pagerScrollTo, viewport } from '@flyingrobots/bijou-tui';
import type { TokenValue } from '@flyingrobots/bijou';
import type {
  ComparisonArtifactNode,
  CollapseProposalNode,
  AttestationNode,
  EntityDetail,
  GraphSnapshot,
  GovernanceArtifactNode,
} from '../../../domain/models/dashboard.js';
import type { StylePort } from '../../../ports/StylePort.js';
import { buildGovernanceWorkSemantics } from '../../../domain/services/WorkSemanticsService.js';
import type { DashboardModel, GovernancePageRoute } from '../DashboardApp.js';
import type { CockpitItem } from '../cockpit.js';
import { laneTitle, shortId, shortPrincipal } from '../cockpit.js';
import {
  buildVerticalScrollbarRail,
  laneAccent,
  paneBodyHeight,
  renderDashboardChrome,
  renderPaneCard,
  renderPaneHeader,
  statusText,
} from './cockpit-view.js';
import { formatAge, wrapWhitespaceText } from '../../view-helpers.js';

const FIELD_LABEL_WIDTH = 14;
const ACTION_KEY_WIDTH = 8;

interface GovernancePageAction {
  key: string;
  label: string;
  token: TokenValue;
}

function pushWrappedText(
  lines: string[],
  text: string,
  width: number,
  prefix = '',
  decorate?: (line: string) => string,
): void {
  const wrapped = wrapWhitespaceText(text, Math.max(1, width - prefix.length));
  for (const line of wrapped) {
    const rendered = decorate ? decorate(line) : line;
    lines.push(`${prefix}${rendered}`);
  }
}

function padVisible(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - text.length));
}

function pushField(
  lines: string[],
  label: string,
  value: string,
  width: number,
  renderValue?: (text: string) => string,
): void {
  const valueWidth = Math.max(1, width - FIELD_LABEL_WIDTH - 1);
  const wrapped = wrapWhitespaceText(value, valueWidth);
  const labelText = padVisible(label, FIELD_LABEL_WIDTH);
  const decorate = renderValue ?? ((text: string): string => text);
  if (wrapped.length === 0) {
    lines.push(`${labelText} `);
    return;
  }
  lines.push(`${labelText} ${decorate(wrapped[0] ?? '')}`);
  for (const line of wrapped.slice(1)) {
    lines.push(`${' '.repeat(FIELD_LABEL_WIDTH)} ${decorate(line)}`);
  }
}

function pushSectionTitle(lines: string[], style: StylePort, title: string): void {
  lines.push(style.styled(style.theme.ui.sectionHeader, title));
}

function pushAction(
  lines: string[],
  style: StylePort,
  action: GovernancePageAction,
  width: number,
): void {
  const labelWidth = Math.max(8, width - ACTION_KEY_WIDTH - 1);
  const wrapped = wrapWhitespaceText(action.label, labelWidth);
  const keyText = style.styled(action.token, padVisible(action.key, ACTION_KEY_WIDTH));
  if (wrapped.length === 0) {
    lines.push(`${keyText} `);
    return;
  }
  lines.push(`${keyText} ${wrapped[0] ?? ''}`);
  for (const line of wrapped.slice(1)) {
    lines.push(`${' '.repeat(ACTION_KEY_WIDTH)} ${line}`);
  }
}

function pushReasonBlock(lines: string[], style: StylePort, item: CockpitItem | undefined, width: number): void {
  if (!item) return;
  if (item.attentionReason) {
    pushWrappedText(lines, `Why hot: ${item.attentionReason}`, width, '', (line) =>
      style.styled(style.theme.semantic.warning, line));
    lines.push('');
    return;
  }
  if (item.operationReason) {
    pushWrappedText(lines, `Why now: ${item.operationReason}`, width, '', (line) =>
      style.styled(style.theme.semantic.info, line));
    lines.push('');
  }
}

function pageTitle(artifact: GovernanceArtifactNode): string {
  switch (artifact.type) {
    case 'comparison-artifact':
      return 'Comparison Artifact';
    case 'collapse-proposal':
      return 'Collapse Proposal';
    case 'attestation':
      return 'Attestation';
  }
}

function actions(style: StylePort): GovernancePageAction[] {
  return [
    { key: 'Esc', label: 'Return to the landing cockpit', token: style.theme.semantic.muted },
    { key: ';', label: 'Comment on this governance artifact', token: style.theme.semantic.info },
  ];
}

function progressIndex(artifact: GovernanceArtifactNode): number {
  const detail = artifact.governance;
  if (detail.kind === 'comparison-artifact') {
    if (detail.settlement.executedCount > 0) return 3;
    if (detail.settlement.proposalCount > 0) return 2;
    if (detail.attestation.state === 'approved') return 1;
    return 0;
  }
  if (detail.kind === 'collapse-proposal') {
    if (detail.execution.executed) return 3;
    if (detail.lifecycle === 'approved') return 2;
    if (detail.executionGate.attestation.state === 'approved') return 1;
    return 0;
  }
  return detail.targetExists ? 1 : 0;
}

function progressLabels(artifact: GovernanceArtifactNode): string[] {
  switch (artifact.type) {
    case 'comparison-artifact':
      return ['Compared', 'Attested', 'Settlement planned', 'Settled'];
    case 'collapse-proposal':
      return ['Compared', 'Attested', 'Ready', 'Executed'];
    case 'attestation':
      return ['Target', 'Decision recorded'];
  }
}

function lifecycleBlock(style: StylePort, artifact: GovernanceArtifactNode): string[] {
  return [
    stepper(progressLabels(artifact).map((label) => ({ label })), {
      current: progressIndex(artifact),
      activeBgToken: style.theme.surface.secondary,
    }),
  ];
}

function renderComparisonFields(
  lines: string[],
  style: StylePort,
  artifact: ComparisonArtifactNode,
  width: number,
): void {
  pushField(lines, 'Freshness', artifact.governance.freshness, width, (value) => statusText(style, value));
  pushField(lines, 'Attest', artifact.governance.attestation.state, width, (value) => statusText(style, value));
  pushField(lines, 'Proposals', String(artifact.governance.settlement.proposalCount), width);
  pushField(lines, 'Executed', String(artifact.governance.settlement.executedCount), width);
  if (artifact.targetId) {
    pushField(lines, 'Target', shortId(artifact.targetId), width);
  }
  if (artifact.leftWorldlineId || artifact.rightWorldlineId) {
    pushField(
      lines,
      'Worldlines',
      [artifact.leftWorldlineId, artifact.rightWorldlineId].filter(Boolean).map((value) => shortId(value ?? '')).join(' vs '),
      width,
    );
  }
}

function renderCollapseFields(
  lines: string[],
  style: StylePort,
  artifact: CollapseProposalNode,
  width: number,
): void {
  pushField(lines, 'Freshness', artifact.governance.freshness, width, (value) => statusText(style, value));
  pushField(lines, 'Lifecycle', artifact.governance.lifecycle, width, (value) => statusText(style, value));
  pushField(lines, 'Executable', artifact.governance.execution.executable ? 'yes' : 'no', width);
  pushField(lines, 'Changed', artifact.governance.execution.changed ? 'yes' : 'no', width);
  pushField(lines, 'Executed', artifact.governance.execution.executed ? 'yes' : 'no', width);
  pushField(lines, 'Gate attest', artifact.governance.executionGate.attestation.state, width, (value) => statusText(style, value));
  if (artifact.comparisonArtifactId) {
    pushField(lines, 'Comparison', shortId(artifact.comparisonArtifactId), width);
  }
  if (artifact.sourceWorldlineId || artifact.targetWorldlineId) {
    pushField(
      lines,
      'Worldlines',
      [artifact.sourceWorldlineId, artifact.targetWorldlineId].filter(Boolean).map((value) => shortId(value ?? '')).join(' → '),
      width,
    );
  }
}

function renderAttestationFields(
  lines: string[],
  style: StylePort,
  artifact: AttestationNode,
  width: number,
): void {
  pushField(lines, 'Decision', artifact.governance.decision ?? 'recorded', width, (value) => statusText(style, value));
  pushField(lines, 'Target', artifact.targetId ? shortId(artifact.targetId) : '—', width);
  pushField(lines, 'Target type', artifact.governance.targetType ?? 'unknown', width);
  pushField(lines, 'Target seen', artifact.governance.targetExists ? 'yes' : 'no', width);
}

function buildGovernancePageContent(
  style: StylePort,
  artifact: GovernanceArtifactNode,
  detail: EntityDetail | null,
  sourceItem: CockpitItem | undefined,
  width: number,
  loading: boolean,
  error: string | null,
): string {
  const lines: string[] = [];
  const semantics = detail ? buildGovernanceWorkSemantics(detail) : null;

  pushWrappedText(lines, pageTitle(artifact), width, '', (line) => style.styled(style.theme.semantic.primary, line));
  lines.push(`${artifact.id}  ${statusText(style, artifact.governance.kind === 'collapse-proposal' ? artifact.governance.lifecycle : artifact.governance.kind === 'comparison-artifact' ? artifact.governance.freshness : artifact.governance.decision ?? 'recorded')}`);
  lines.push('');
  pushReasonBlock(lines, style, sourceItem, width);

  if (loading && !detail) {
    lines.push(style.styled(style.theme.semantic.muted, 'Loading full governance detail...'));
    lines.push('');
  } else if (error) {
    lines.push(style.styled(style.theme.semantic.error, `Could not load governance detail: ${error}`));
    lines.push('');
  }

  pushSectionTitle(lines, style, 'Actions');
  for (const action of actions(style)) {
    pushAction(lines, style, action, width);
  }
  lines.push('');

  pushSectionTitle(lines, style, 'Progress');
  lines.push(...lifecycleBlock(style, artifact));
  lines.push('');

  pushSectionTitle(lines, style, 'Current State');
  switch (artifact.type) {
    case 'comparison-artifact':
      renderComparisonFields(lines, style, artifact, width);
      break;
    case 'collapse-proposal':
      renderCollapseFields(lines, style, artifact, width);
      break;
    case 'attestation':
      renderAttestationFields(lines, style, artifact, width);
      break;
  }
  lines.push('');

  if (artifact.recordedBy || artifact.recordedAt) {
    pushSectionTitle(lines, style, 'Recorded');
    pushField(lines, 'By', artifact.recordedBy ? shortPrincipal(artifact.recordedBy) : 'unknown', width);
    pushField(lines, 'When', artifact.recordedAt ? `${formatAge(artifact.recordedAt)} ago` : 'unknown', width);
    lines.push('');
  }

  if (semantics) {
    pushSectionTitle(lines, style, 'Judgment');
    pushField(lines, 'Attention', semantics.attentionState, width, (value) => statusText(style, value));
    pushField(lines, 'Expected actor', semantics.expectedActor, width);
    if (semantics.blockingReasons.length > 0) {
      lines.push('');
      pushWrappedText(lines, 'Blocking reasons', width, '', (line) => style.styled(style.theme.semantic.warning, line));
      for (const reason of semantics.blockingReasons) {
        pushWrappedText(lines, reason, width, '  ');
      }
    }
    if (semantics.missingEvidence.length > 0) {
      lines.push('');
      pushWrappedText(lines, 'Missing evidence', width, '', (line) => style.styled(style.theme.semantic.warning, line));
      for (const item of semantics.missingEvidence) {
        pushWrappedText(lines, item, width, '  ');
      }
    }
    if (semantics.nextLawfulActions.length > 0) {
      lines.push('');
      pushWrappedText(lines, 'Next lawful actions', width, '', (line) => style.styled(style.theme.semantic.primary, line));
      for (const action of semantics.nextLawfulActions) {
        pushWrappedText(
          lines,
          `${action.label} · ${action.allowed ? 'allowed' : 'blocked'}`,
          width,
          '  ',
          (line) => style.styled(action.allowed ? style.theme.semantic.success : style.theme.semantic.muted, line),
        );
        pushWrappedText(lines, action.reason, width, '    ');
        for (const blocker of action.blockedBy) {
          pushWrappedText(lines, blocker, width, '      ');
        }
      }
    }
    lines.push('');
  }

  pushSectionTitle(lines, style, 'Edges');
  pushField(lines, 'Outgoing', String(detail?.outgoing.length ?? 0), width);
  pushField(lines, 'Incoming', String(detail?.incoming.length ?? 0), width);
  if (detail?.outgoing.length) {
    pushWrappedText(lines, detail.outgoing.map((entry) => `${entry.label}:${shortId(entry.nodeId)}`).join(', '), width, '  ');
  }
  if (detail?.incoming.length) {
    pushWrappedText(lines, detail.incoming.map((entry) => `${entry.label}:${shortId(entry.nodeId)}`).join(', '), width, '  ');
  }

  return lines.join('\n');
}

export function governancePageView(options: {
  model: DashboardModel;
  snapshot: GraphSnapshot;
  page: GovernancePageRoute;
  artifact: GovernanceArtifactNode;
  detail: EntityDetail | null;
  sourceItem?: CockpitItem;
  style: StylePort;
  width?: number;
  height?: number;
}): string {
  const { model, snapshot, page, artifact, detail, sourceItem, style } = options;
  const width = options.width ?? model.cols;
  const height = options.height ?? Math.max(8, model.rows - 2);
  const accentToken = laneAccent(style, page.sourceLane);
  const chrome = renderDashboardChrome({
    lane: page.sourceLane,
    agentId: model.agentId,
    health: model.health,
    nowView: model.nowView,
    breadcrumbSegments: ['Landing', laneTitle(page.sourceLane), shortId(page.entityId)],
  }, snapshot, model, style, width);
  const chromeHeight = chrome.split('\n').length;
  const bodyHeight = Math.max(1, height - chromeHeight - 1);

  const header = renderPaneHeader({
    title: style.styled(accentToken, pageTitle(artifact)),
    detail: style.styled(accentToken, shortId(page.entityId)),
    width,
    borderToken: accentToken,
  });
  const innerWidth = Math.max(12, width - 4);
  const innerHeight = paneBodyHeight(bodyHeight, header);
  const content = buildGovernancePageContent(
    style,
    artifact,
    detail,
    sourceItem,
    innerWidth,
    model.pageLoading,
    model.pageError,
  );

  let pagerState = createPagerState({
    content,
    width: innerWidth,
    height: innerHeight,
  });
  pagerState = pagerScrollTo(pagerState, model.pageScrollY);
  const totalLines = Math.max(1, pagerState.scroll.totalLines);
  const overflowing = totalLines > Math.max(1, innerHeight - 1);
  const bodyLines = overflowing
    ? pager(pagerState, { showScrollbar: false }).split('\n')
    : viewport({
        width: innerWidth,
        height: innerHeight,
        content,
        scrollY: 0,
        showScrollbar: false,
      }).split('\n');
  if (overflowing && bodyLines.length > 0) {
    bodyLines[bodyLines.length - 1] = style.styled(
      style.theme.semantic.muted,
      `  Scroll ${pagerState.scroll.y + 1}/${totalLines}`,
    );
  }
  const bodyRightRail = overflowing
    ? buildVerticalScrollbarRail(style, {
        height: innerHeight,
        offset: pagerState.scroll.y,
        viewportSize: Math.max(1, innerHeight - 1),
        totalSize: totalLines,
        visibility: model.scrollbars.page.level,
      })
    : undefined;

  const pane = renderPaneCard({
    header,
    width,
    height: bodyHeight,
    borderToken: accentToken,
    bodyLines,
    bodyRightRail,
  });

  return [chrome, '', pane].join('\n');
}
