# XYPH advisory export: Claude session review

## Executive summary

Claude found a real product need: the repo needs semantic maintenance commands instead of one-off graph scripts.
That part is correct.

But the implementation path in the transcript drifted into risky territory:
- it added commands before pinning down invariants,
- it treated authorization as mostly a CLI concern,
- it started a type-level sovereignty refactor that cannot actually prove human authority,
- and it appears to have introduced a semantic bug: `move` adds a `belongs-to` edge instead of clearly replacing the existing campaign assignment.

My recommendation is simple:
1. keep the command-shape decision,
2. stop the ad hoc authority refactor where it is,
3. define the mutation contract first,
4. then re-implement `move`, `authorize`, and `link` through a single policy-checked write path.

## What Claude got right

### 1) It identified the missing abstraction
A repo like this should not require low-level graph surgery for routine maintenance.
A semantic command family is the right answer.

The three-command split is good:
- `move <quest> --campaign <id>`
- `authorize <quest> --intent <id>`
- `link <quest> --campaign <id> --intent <id>` as a convenience wrapper

That is cleaner than one-off scripts and matches the existing planning direction.

### 2) It noticed that authorization is special
The user's pushback was dead right:
authorizing a task against an intent is not just "linking two nodes."
It is a sovereignty act.
Treating `authorized-by` as just another edge is too casual.

### 3) It started pushing enforcement downward
The instinct to move checks out of random call sites and into shared infrastructure is correct.
The problem is not the direction.
The problem is that branded strings are not enough.

## Where Claude went off the rails

### 1) TypeScript cannot prove someone is a human
A branded `HumanPrincipal` can prove that some boundary function once validated a string.
It cannot prove:
- the actor actually controls the identity,
- the mutation was signed,
- the approval gate was satisfied,
- the writer was allowed to issue this specific class of mutation.

That is runtime authority, not compile-time truth.

So: keep value objects if you want better ergonomics, but do not confuse them with security.

### 2) `move` looks semantically wrong
In the transcript, `move` is described as "reassign a quest to a campaign."
But the implementation only adds a new `belongs-to` edge.

If a task already belongs to a campaign, "move" should almost certainly remove the previous campaign edge or otherwise enforce single-campaign cardinality.
If you do not do that, you do not have move.
You have attach-another-campaign.

That is exactly the kind of bug that quietly poisons planning state.

### 3) The new commands appear to skip rationale requirements
The planning documents are explicit that mutations require rationale and reversibility.
The transcript version of `move`, `authorize`, and `link` takes no rationale at all.

That is not a cosmetic miss.
It undercuts provenance.

### 4) The write path is still too open
If raw graph patching remains available in multiple adapters, scripts, and CLI commands, then "we added a runtime guard in one shared helper" is not enough.
Someone will bypass it later.
Usually by accident.
Then six weeks later the graph has impossible state and everyone acts surprised.

### 5) The refactor started before the policy model was settled
Claude began threading new principal types through ports and adapters.
That is too early.
The repo first needs a crisp answer to:
- what mutations are sovereignty-sensitive,
- what evidence is required,
- where those checks live,
- what receipt gets emitted,
- and what graph invariants are enforced transactionally.

Without that, you just smear partial policy across the codebase.

## What the provided specs imply

### Graph semantics
The authoritative graph schema defines:
- `belongs-to` as task -> campaign/milestone,
- `authorized-by` as task -> intent,
- `depends-on` as task -> task,
and describes quests as belonging to a campaign and tracing to human intent.

That makes campaign assignment and intent authorization first-class semantics, not generic graph plumbing.

### Human sovereignty
The constitution is blunt:
- humans can override agents,
- critical-path or major scope changes need human sign-off,
- every mutation needs rationale,
- and reversibility is mandatory.

That means authorization is not just an edge operation.
It is a governed mutation.

### Centralized write gates
The apply transaction spec says the apply path is the only write gate in the planning compiler, with preconditions, rollback, receipts, and all-or-nothing semantics.
Even if current XYPH has not fully landed that architecture yet, the direction is obvious:
important writes should funnel through one policy-checked mutation path, not scattered `graph.patch()` calls.

### Agent model caveat
The agent charter is explicitly marked draft and says the current system still uses a single generic writer identity per participant.
So a future six-agent permission story should not be treated as if it is already implemented.
Do not design against imaginary enforcement.

## What I would do next

### Immediate action
- Stop the principal-type refactor where it currently is.
- Keep the idea, but do not keep threading half-designed authority types through the system.
- Put the new command work on a short leash until semantics are fixed.

### Fix the command contract before more code lands
For `move`:
- require a rationale,
- determine whether cardinality is exactly one campaign or zero-or-one campaign,
- remove the old `belongs-to` edge when reassigning,
- reject ambiguous prior state if more than one campaign edge already exists,
- emit a receipt.

For `authorize`:
- require a human actor,
- require rationale,
- decide whether multiple intents are allowed,
- if not, replace the old intent link rather than stacking them,
- emit a receipt or provenance record.

For `link`:
- treat it as orchestration only,
- internally perform `move` then `authorize`,
- if authorization fails, do not leave behind a half-completed operation unless the command explicitly says it is best-effort,
- ideally make it transactional from the user's point of view.

### Add one real enforcement layer
Create a single domain service that owns these mutations.
Example shape:

- `MutationPolicy` or `RoadmapWriteGate`
- `moveQuest(...)`
- `authorizeQuest(...)`
- `linkQuest(...)`

That service should:
- validate actor capability,
- validate graph preconditions,
- apply edge/property changes,
- enforce cardinality,
- require rationale,
- emit a receipt,
- and be the only place CLI commands call for these actions.

That is the leverage point.
Not the CLI.
Not a random adapter.
One choke point.

### Use value objects, not magic strings
I would still use parsed value objects, but as ergonomics and correctness aids:
- `Principal`
- `HumanActor`
- `AgentActor`
- `QuestId`
- `CampaignId`
- `IntentId`
- maybe `Rationale`

These help the compiler catch garbage.
They do not replace policy enforcement.

### Write the tests that actually matter
Before broad refactoring, add these tests:

1. `move` replaces, not accumulates, campaign assignment
2. `move` rejects multiple existing campaign edges unless explicitly repaired
3. `authorize` is forbidden for non-human actors
4. `authorize` records provenance and rationale
5. `link` cannot leave partial state behind on failed authorization
6. raw helper paths cannot bypass the policy service
7. repeated invocation is idempotent where intended
8. command JSON output includes enough provenance to audit the change

## My blunt recommendation

Claude's strategic instinct was good.
Its tactical sequencing was sloppy.

Do not keep freehanding policy into the repo.
Freeze the current sovereignty refactor.
Define the mutation contract.
Then implement:
1. `move`
2. `authorize`
3. `link`
through one enforcement service with tests.

The repo is clearly trying to be a constitutional system, not a pile of convenient graph edits.
So act like it.

## Suggested next patch sequence

1. Revert or pause the unfinished principal-type threading.
2. Write a short spec for `move`, `authorize`, and `link`:
   - required args,
   - rationale rules,
   - authority rules,
   - cardinality rules,
   - receipt behavior,
   - partial-failure behavior.
3. Implement a single policy-checked service.
4. Rewire CLI commands to use it.
5. Add invariants tests.
6. Then resume broader identity typing only if it still pays for itself.

## Sources consulted

- AGENT_CHARTER.md
- GRAPH_SCHEMA.md
- APPLY_TRANSACTION_SPEC.md
- CONSTITUTION.md
- PATCH_OPS_INVARIANTS.md
- POLICY_ENGINE.md
- SECURITY_AND_TRUST.md