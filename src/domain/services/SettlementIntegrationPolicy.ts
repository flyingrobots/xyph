import type { IntegrationCheck } from '../../ports/WorkspacePort.js';

export function formatUnreviewedIntegrationMessage(
  mergeRef: string,
  into: string,
  integration: IntegrationCheck,
): string {
  const where = integration.integrationCommit === null
    ? `${into} does not contain it on its first-parent history`
    : `${integration.integrationCommit.slice(0, 7)} brought it into ${into}`;
  return `Patchset tip ${mergeRef.slice(0, 7)} is already in ${into}, but what ${into} received is not the approved patchset: `
    + `${where}${integration.reason === null ? '' : ` (${integration.reason})`}. `
    + 'Refusing to settle. A retry gives the same result, because the integration is already in the history. '
    + 'Submit the content that the target actually received as a new patchset for review, '
    + 'or repair the target branch through your normal recovery process.';
}
