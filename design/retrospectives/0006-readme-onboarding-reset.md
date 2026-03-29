# 0006 Retrospective: README Onboarding Reset

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0006-readme-onboarding-reset.md`](../cycles/0006-readme-onboarding-reset.md)
- [`/Users/james/git/xyph/design/README.md`](../README.md)

## What Landed

- [`/Users/james/git/xyph/README.md`](../../README.md) now introduces XYPH in
  plain product language before it leans on deeper ontology.
- The older slogan-heavy opening was removed in favor of a calmer top section.
- A compact quick-start path now lets a reader create and inspect real XYPH
  work before the larger workflow walkthrough.
- A README shape test now pins the intended onboarding order and guards against
  regression.

## Design Alignment Audit

- the README now explains what XYPH is before deeper doctrine: aligned
- core vocabulary appears before later sections depend on it: aligned
- a truthful first-use path exists: aligned
- the later README still reflects the shipped product honestly: aligned

## Drift

- The README still opens with a large branded visual block before the prose.
- Some later sections still use product-internal language density that may be
  heavier than ideal for a first-time evaluator.
- The quick-start uses `--campaign none`, which is truthful but exposes current
  CLI awkwardness rather than an ideal beginner command shape.

## Why The Drift Happened

- This slice was intentionally bounded around onboarding order and tone rather
  than a full public-surface redesign.
- The visual/title treatment is part of the repo's current identity and was not
  the main source of reader confusion compared with the prose order.
- The quick-start must stay truthful to the current CLI, even when that reveals
  a less-than-ideal command contract.

## Resolution

- Accept this as a meaningful onboarding improvement.
- Leave deeper README tightening as a follow-on if future review still shows
  first-time reader confusion.
- Carry the `--campaign none` awkwardness as public-surface debt rather than
  papering over it in documentation.
