# 0006: README Onboarding Reset

## Cycle Type

Docs/product-surface alignment

This cycle resets the public onboarding path in [`/Users/james/git/xyph/README.md`](../../README.md)
so the repo introduces XYPH plainly before it leans on doctrine, lore, or
internal vocabulary.

## Graph Anchor

- Work item: `task:readme-onboarding-reset`

## Why This Cycle Exists

The current README is not dishonest, but it front-loads too much branded and
internal language before a new reader understands the product:

- the opening assumes the reader already knows what XYPH and WARP are
- key vocabulary appears before it is defined
- brand/doctrine language outruns practical onboarding
- the file does not yet feel like a grounded first-use path for either a human
  evaluator or a coding agent entering the repo cold

That means the README currently leaks implementation doctrine and internal
identity work ahead of the simpler job:

- what is XYPH?
- what problem does it solve?
- how do I try it?

## Sponsor Actors

### Primary sponsor actor

**First-Time Repo Visitor**

Needs to understand what XYPH is, what kind of system it is, and how to try one
small truthful workflow without having to decode internal vocabulary first.

### Secondary sponsor actors

**Cold-Start Worker Agent**

Needs a README that makes the product model legible enough to infer the right
commands and surfaces without reconstructing the ontology from scattered docs.

**Evaluating Maintainer**

Needs the README to reflect the actual product honestly rather than reading like
brand copy detached from the real CLI, TUI, and graph-backed workflow.

## Outcome Hill

**As a new human reader or cold-start agent, I can land on the XYPH repo,
understand what the product is, learn the core vocabulary in the right order,
and complete a small first-use path before the README asks me to internalize
the deeper doctrine.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns meaning.
- Human and agent surfaces must stay equally legible.
- The README must stay honest about XYPH's real shipped surfaces.
- WARP/worldline/doctrine language may remain present, but only after the file
  has earned it.

## Scope

In scope:

- rewrite the README opening and early teaching order
- define core XYPH vocabulary before deeper sections rely on it
- add a small quick-start path that feels grounded and truthful
- keep the later sections aligned with the calmer onboarding voice
- pin the intended README shape with executable spec

Out of scope:

- changing XYPH ontology
- redesigning CLI commands
- rewriting the whole canonical docs corpus
- hiding real product complexity behind marketing simplification

## Acceptance-Test Plan

### Checkpoint 1: Progressive disclosure

1. The README begins with a plain-language explanation of XYPH before deeper
   doctrine or branded language.
2. Core workflow nouns appear in a glossary/concepts section before later
   sections depend on them.

### Checkpoint 2: First-use path

3. The README contains a compact quick-start path that lets a reader create and
   inspect real XYPH work.
4. The walkthrough and later sections still describe the shipped product
   honestly after the reset.

## Implementation Notes

- Prefer clarity over cleverness.
- The title treatment can stay visual, but the prose directly under it should
  read like product onboarding, not manifesto copy.
- Keep strong product ideas, but delay them until the reader has footing.

## Playback Questions

1. Can a first-time reader explain XYPH back in one or two plain sentences
   after the first screenful?
2. Can an agent identify the right first commands without reverse-engineering
   the ontology from later docs?
3. Does the README now earn its deeper doctrine instead of assuming it?

## Exit Criteria

This cycle closes when:

- the README introduces XYPH plainly and progressively
- a small quick-start path exists
- a README-shape test encodes the intended onboarding structure
- the retrospective audits any remaining drift honestly
