# Raw Materialization Knowledge Leak in Xyph Causal Code

## Overview
Per the `git-warp` repo-level mandate, all CAS operations MUST go through `git-cas`. Period. Xyph must not be involved in materialization, care about it, or know what it is. Any manual materialization handling or raw git object storage calls within Xyph violate substrate encapsulation.

## Severity & Impact
**Severity: High**
**Impact:** If Xyph attempts to manually materialize graph states or invoke raw Git storage APIs (such as `git hash-object`), it bypasses `git-warp`'s streaming CAS-First Memoization Engine and `@git-stunts/git-cas`'s Buzhash Content-Defined Chunking (CDC) deduplication layer. This leads to severe memory inflation, redundant storage blobs, and breaks the clean separation of concerns between Xyph's causal domain and `git-warp`'s persistence kernel.

## Concrete Refactoring Path
1. Establish a CI invariant gate in Xyph (`scripts/check-materialization-leak.sh`) to scan the codebase for raw Git storage CLI invocations or manual materialization logic.
2. Purge all legacy materialization frontdoors from Xyph's services.
3. Strict adherence to pure `IntentDescriptor` admission through `OpticDomainActionService` over `WarpWorldline`, delegating all persistence and chunking entirely to `git-warp`.
