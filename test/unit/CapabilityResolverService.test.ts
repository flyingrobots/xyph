import { describe, expect, it } from 'vitest';
import { CapabilityResolverService } from '../../src/domain/services/CapabilityResolverService.js';
import type { ControlPlaneRequestV1 } from '../../src/domain/models/controlPlane.js';

function request(
  cmd: string,
  args: Record<string, unknown> = {},
  auth?: ControlPlaneRequestV1['auth'],
): ControlPlaneRequestV1 {
  return {
    v: 1,
    id: 'req-1',
    cmd,
    args,
    ...(auth === undefined ? {} : { auth }),
  };
}

describe('CapabilityResolverService', () => {
  it('resolves a request-auth principal separately from the runtime default', () => {
    const resolver = new CapabilityResolverService('agent.prime');

    const capability = resolver.resolve(request('observe', {}, {
      principalId: 'human.ada',
    }));

    expect(capability.principal).toEqual({
      principalId: 'human.ada',
      principalType: 'human',
      source: 'request-auth',
    });
  });

  it('keeps observer profile descriptive and independent from capability decisions', () => {
    const resolver = new CapabilityResolverService('agent.prime');

    const agentCapability = resolver.resolve(request('attest', {
      observerProfileId: 'observer:wide',
    }));
    const humanCapability = resolver.resolve(request('attest', {
      observerProfileId: 'observer:wide',
    }, {
      principalId: 'human.ada',
    }));

    expect(agentCapability.observer).toEqual(expect.objectContaining({
      observerProfileId: 'observer:wide',
    }));
    expect(humanCapability.observer).toEqual(expect.objectContaining({
      observerProfileId: 'observer:wide',
    }));
    expect(resolver.authorize(agentCapability, 'attest')).toEqual(expect.objectContaining({
      allowed: false,
      code: 'capability_denied',
    }));
    expect(resolver.authorize(humanCapability, 'attest')).toEqual(expect.objectContaining({
      allowed: true,
    }));
  });

  it('requires explicit admin mode for hidden admin commands', () => {
    const resolver = new CapabilityResolverService('agent.prime');

    const noAdmin = resolver.resolve(request('query', {}, {
      principalId: 'human.ada',
    }));
    const admin = resolver.resolve(request('query', {}, {
      principalId: 'human.ada',
      admin: true,
    }));

    expect(resolver.authorize(noAdmin, 'query')).toEqual(expect.objectContaining({
      allowed: false,
      code: 'capability_denied',
    }));
    expect(admin.capabilityMode).toBe('admin');
    expect(resolver.authorize(admin, 'query')).toEqual(expect.objectContaining({
      allowed: true,
    }));
  });

  it('denies authoritative apply mutations for service principals', () => {
    const resolver = new CapabilityResolverService('agent.prime');

    const capability = resolver.resolve(request('apply', {}, {
      principalId: 'service.scheduler',
    }));

    expect(capability.principal.principalType).toBe('service');
    expect(resolver.authorize(capability, 'apply')).toEqual(expect.objectContaining({
      allowed: false,
      code: 'capability_denied',
    }));
  });
});
