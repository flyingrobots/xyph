import type { EntityDetail } from '../models/dashboard.js';
import type { ObservationSession } from '../../ports/ObservationPort.js';

function inferEntityType(id: string, props: Record<string, unknown>): string {
  const explicit = props['type'];
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  return id.split(':', 1)[0] ?? 'unknown';
}

export async function readGenericEntityDetail(
  session: ObservationSession,
  id: string,
): Promise<EntityDetail | null> {
  const props = await session.getNodeProps(id);
  if (!props) return null;

  const [outgoing, incoming, content, contentOid] = await Promise.all([
    session.neighbors(id, 'outgoing'),
    session.neighbors(id, 'incoming'),
    session.getContent(id),
    session.getContentOid(id),
  ]);

  return {
    id,
    type: inferEntityType(id, props),
    props,
    ...(content === undefined ? {} : { content }),
    ...(contentOid === undefined ? {} : { contentOid }),
    outgoing,
    incoming,
  };
}
