# Acceptance Tests

Acceptance tests are the executable behavioral spec for bounded XYPH cycles.

The organizing rule is:

- **acceptance tests follow the cycle hierarchy**
- **unit and integration tests follow the architecture**

That means:

- cycle-level behavior should live under `test/acceptance/`
- reusable fixtures stay under `test/fixtures/`
- lower-level correctness stays in `test/unit/` and `test/integration/`

## Why The Hierarchy Splits

Cycle notes answer:

- what sponsor actor this work is for
- what outcome hill it advances
- what behaviors must become true

Acceptance tests should mirror that same bounded slice so the cycle can be
judged complete by behavior instead of by implementation folklore.

Unit and integration tests serve a different purpose. They protect module and
service correctness at architectural seams. They should remain organized by the
actual structure of the system rather than being shuffled every time a product
cycle changes.

## Expected Layout

As acceptance coverage grows, prefer a structure like:

- `test/acceptance/cycles/0001-suggestion-adoption/`
- `test/acceptance/cycles/0002-agent-cli-hardening/`

Within each cycle directory, organize by the behaviors that matter to the
cycle, not by internal class names.

## Rule

If a behavior is how we decide whether a cycle is done, it belongs in
acceptance tests.

If a test mainly protects an adapter, service, parser, or lower-level invariant,
it should stay in unit or integration tests instead.
