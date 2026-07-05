# Supported Outcome Settlement

Status: canonical internal doctrine.

Supported Outcome Settlement is the internal name for the direction previously
called ULTRAGOLD during discussion. Use this name in design docs, issues, and
cross-repo planning.

## Doctrine

XYPH settles supported claims, not foreign receipts.

A foreign runtime may produce a receipt, witness core, hologram, support ledger,
or obstruction record. Continuum may transport and check that support. XYPH
alone decides whether the resulting observation has native consequence for a
Quest.

The model has two independent axes:

```text
outcome kind x support tier
```

Examples:

```text
completed x tier3_holographic_support_ledger
obstructed_repairable x tier3_holographic_support_ledger
blocked_authority x tier2_history_inclusion
repair_candidate x tier4_native_hologram_verification
disputed x tier4_5_challenge_replay
```

## Outcome Taxonomy

The settlement law must keep these terms distinct:

| Term | Meaning | XYPH use |
| --- | --- | --- |
| `completed` | The foreign observation satisfies the Quest completion criterion. | May settle the Quest as complete. |
| `obstructed_repairable` | The attempt was lawfully blocked, and a repair path is available. | May move the Quest to a repairable blocked state or spawn repair work. |
| `blocked_authority` | The attempt lacked capability, grant, or policy authority. | May request authority or mark the claim blocked. |
| `underdetermined` | Support was insufficient for the requested purpose. | Must not settle as completion. |
| `disputed` | Support or observations conflict. | May require challenge replay, review, or stronger support. |
| `failed_invalid` | The proposal was malformed or not meaningful under the law. | May reject or close diagnostic work only. |

Obstruction is not absence of history. A typed obstruction is causal material:
an attempt was submitted, checked, refused or blocked for a typed reason, and
witnessed at a runtime coordinate.

## Strand Neighborhood Vocabulary

WARP time-travel/debugger language should use `strand neighborhood` for the
full neighborhood around a tick:

- actual committed path;
- legal unselected counterfactuals;
- obstructed attempts;
- repair candidates;
- invalid proposals.

Keep the kernel terms strict:

```text
Counterfactual = legal but unselected.
Obstructed = refused or blocked but causally witnessed.
Repair candidate = new lawful proposal derived from obstruction.
```

Do not redefine counterfactual to include stale-base obstructions.

## Support Tiers

The support tier is configurable per Quest support obligation and must be
disclosed in settlement receipts.

| Tier | Name | Role |
| --- | --- | --- |
| 0 | Agent assertion | Worklog only, never settlement-grade. |
| 1 | Signed receipt shell | Jim or another source signed a shell. |
| 2 | History inclusion | Receipt/event included in source history. |
| 3 | Holographic support ledger | Buildable default: inclusion, admission, hologram, state openings, claim binding. |
| 4 | Native hologram verification | A consuming verifier checks the hologram relation. |
| 4.5 | Challenge replay | Audit/dispute tool that reruns the same basis and compares witness core. |
| 5 | Proof-carrying hologram verification | Future high-assurance proof that the verifier accepted. |

The buildable default is Tier 3. Tier 4 is preferred where a narrow verifier
exists. Tier 5 is future/high-assurance, not a v1 baseline.

## Authority Boundary

```text
Agent proposes.
Edict defines.
Jim admits.
Echo executes or obstructs.
Jim witnesses.
Continuum transports and checks support.
XYPH judges native consequence.
git-warp records XYPH history.
```

Foreign support does not equal native consequence.

## XYPH Consequence Shape

The implementation should prefer a consequence layer over expanding raw Quest
status too early:

```ts
type XyphQuestConsequence =
  | { kind: "SETTLED"; reason: "criterion_satisfied" }
  | { kind: "BLOCKED_REPAIRABLE"; obstruction: string; repairOperators: string[] }
  | { kind: "BLOCKED_AUTHORITY"; missingAuthority: string }
  | { kind: "UNDERDETERMINED"; missingSupport: string[] }
  | { kind: "DISPUTED"; conflictDigest: string }
  | { kind: "FAILED_INVALID"; reason: string };
```

Quest criteria decide whether an obstruction is failure, repairable blockage,
diagnostic completion, or something else. Jim does not decide that for XYPH.
Continuum does not decide that for XYPH. The agent never self-settles.

## Supersession

This doctrine supersedes any design phrasing that implies:

- every XYPH settlement requires zkVM-grade proof-carrying execution;
- receipt shells are settlement;
- Continuum creates native consequence;
- all unrealized paths are counterfactuals;
- stale-base obstruction means "nothing happened."

The retained replacement is:

```text
No settlement without support.
No support without context.
No consequence without authority.
No proof-tier inflation.
```
