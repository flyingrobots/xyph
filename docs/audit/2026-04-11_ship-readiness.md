# AUDIT: READY-TO-SHIP ASSESSMENT (2026-04-11)

### 1. QUALITY & MAINTAINABILITY ASSESSMENT (EXHAUSTIVE)

1.1. **Technical Debt Score (1-10):** 4
    - **Justification:**
        1. **God Modules (`DashboardApp.ts`, `ControlPlaneService.ts`)**: Core logic is concentrated in two massive files, creating a significant risk for merge conflicts and developer friction.
        2. **Git Commit Churn**: Lack of batching in `CoordinatorService.orchestrate()` leads to unnecessary Git overhead.
        3. **Ad-hoc State Management**: The TUI cockpit lacks a formal state machine, relying instead on complex conditional logic within the `update()` loop.

1.2. **Readability & Consistency:**
    - **Issue 1:** The `Digital Guild` vocabulary is powerful but dense. A new engineer may struggle to distinguish between a `Submission` and a `Quest` status without deep reading.
    - **Mitigation Prompt 1:** `Implement 'Semantic Type Hints' in the domain entities that provide human-readable aliases for complex Digital Guild states, surfacing them in CLI help and TUI tooltips.`
    - **Issue 2:** Dependency injection is used inconsistently across domain services and adapters.
    - **Mitigation Prompt 2:** `Standardize the DI pattern across 'src/domain/services/' by ensuring all services receive their ports and dependent services through a single 'Context' object or constructor injection.`
    - **Issue 3:** Error codes are inconsistent between the CLI actuator and the JSONL control plane.
    - **Mitigation Prompt 3:** `Unify the error taxonomy by creating a shared 'XyphError' class that maps internal domain failures to stable, versioned error codes used by both CLI and API surfaces.`

1.3. **Code Quality Violation:**
    - **Violation 1: SRP (`DashboardApp.ts`)**: It handles everything from lane layout to specific item page rendering and command emission.
    - **Violation 2: SRP (`ControlPlaneService.ts`)**: It implements the entire JSONL command vocabulary in a single switch-statement or method set.
    - **Violation 3: SoC (`WarpGraphAdapter.ts`)**: It handles low-level graph mechanics while also managing some Digital Guild ontology mapping.

### 2. PRODUCTION READINESS & RISK ASSESSMENT (EXHAUSTIVE)

2.1. **Top 3 Immediate Ship-Stopping Risks (The "Hard No"):**
    - **Risk 1: Git Lock Contention (High)**: Rapid-fire mutations in `CoordinatorService.orchestrate()` without batching could lead to `.git/index.lock` collisions in concurrent human/agent environments.
    - **Mitigation Prompt 7:** `Refactor 'CoordinatorService.orchestrate()' to gather all quest mutations into a single 'graph.patch()' call, ensuring atomic commitment and neutralizing lock contention.`
    - **Risk 2: Invalid DAG State (Medium)**: While dependency cycles are rejected at write time, the `DepAnalysis` service lacks a global 'DAG Sanity' check that can be run periodically to detect external corruption.
    - **Mitigation Prompt 8:** `Add a 'dag_verify' tool to the Control Plane and a corresponding CLI command that performs a total topological sort of the entire graph to prove the absence of cycles and orphans.`
    - **Risk 3: Unsigned Scrolls (Low)**: In solo work, agents can seal quests without a Guild Seal, creating a gap in the cryptographic audit trail if not explicitly enforced by policy.
    - **Mitigation Prompt 9:** `Implement a 'Sovereignty Policy' flag that, when enabled, rejects 'seal' operations if a valid Ed25519 Guild Seal is not provided, ensuring all settled work is cryptographically attributed.`

2.2. **Security Posture:**
    - **Vulnerability 1: Secret Exposure in Log**: `actuator.log` could capture sensitive command arguments (e.g., identity keys) if not properly masked.
    - **Mitigation Prompt 10:** `Add an 'Argument Masking' layer to the diagnostic logger that identifies and redacts potential secrets (keys, tokens, passphrases) before they are written to durable logs.`
    - **Vulnerability 2: Command Injection**: Speculative worldline names or scopes provided via JSONL could be used to inject shell escape sequences in the Git adapter.
    - **Mitigation Prompt 11:** `Rigorously sanitize all worldline and identity identifiers using a strict alphanumeric regex before passing them to the GitClient or WarpGraph ports.`

2.3. **Operational Gaps:**
    - **Gap 1: Daemon Liveness**: No built-in health-check endpoint for the `coordinator-daemon`.
    - **Gap 2: Audit Exporter**: No tool to export the Genealogy of Intent as a signed, portable evidence package for external auditors.
    - **Gap 3: Performance Budgets**: No CI check for the "Time to Convergence" benchmark as the graph scale increases.

### 3. FINAL RECOMMENDATIONS & NEXT STEP

3.1. **Final Ship Recommendation:** **YES, BUT...** (Batch the Git mutations and sanitize JSONL inputs immediately).

3.2. **Prioritized Action Plan:**
    - **Action 1 (High Urgency):** Batch quest ingestion in `CoordinatorService` to reduce Git lock contention.
    - **Action 2 (Medium Urgency):** Decompose `DashboardApp.ts` and `ControlPlaneService.ts`.
    - **Action 3 (Low Urgency):** Implement the 'Digital Guild Lifecycle' manifest.
