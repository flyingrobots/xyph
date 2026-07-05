# Documentation and README Audit (v2.0: Completeness Check)

**Role:** Technical Writer & Senior Developer Advocate
**Codebase:** Agent Planning and Orchestration Framework (`xyph`)
**Date:** 2026-06-28

---

## 1. ACCURACY & EFFECTIVENESS ASSESSMENT

- **1.1. Core Mismatch:**
  - The single most critical piece of inaccurate information in `README.md` is the statement in `What is Real Today (~55-60% Complete)` and `The Next Clean Sequence` claiming that `SubmissionReadService` still needs to be modernized and that the TUI relies on legacy polling. In reality, Xyph has moved the current TUI write path behind `RuntimeCommandIntentRoute` and `CommandIntentExecutorPort`, and `WarpSubmissionReadAdapter` is operational. Furthermore, `xyph.ts` is now the canonical entrypoint for graph dogfooding (`xyph.ts note ...`), but the Quick Start only mentions `xyph-actuator.ts`.

- **1.2. Audience & Goal Alignment:**
  - **Audience:** Autonomous AI agents (actuator/MCP packets), human operators (Bijou TUI cockpit), and core framework developers.
  - **Top 3 Questions:** (1) How do I start/bootstrap Xyph and claim work? (2) How do agents interact with the causal graph via Edict capabilities? (3) How do I extend the TUI or write custom intent routes?
  - **Alignment:** While `README.md` brilliantly explains the Digital Guild ontology and post-Unix philosophy, it completely fails to explain the new CQRS intent-based view architecture, how to write custom Bijou blocks, or how to invoke `xyph.ts` for dogfooding graph notes.

- **1.3. Time-to-Value (TTV) Barrier:**
  - The most significant bottleneck is the `Quick Start` section. It instructs developers to run `npx tsx xyph-actuator.ts generate-key` and `npx tsx xyph-actuator.ts login human.ada`, but completely omits the required environment variable setup (e.g., `XYPH_WORLDLINE_ID`, `XYPH_TEST_IN_MEMORY`, and the location of `.xyph.json` credentials). This leaves developers confused when attempting to run the TUI or execute dry-run intent tests.

---

## 2. REQUIRED UPDATES & COMPLETENESS CHECK

- **2.1. README.md Priority Fixes:**
  1. **What is Real Today:** Update the section to reflect the current command-intent executor seam, the active release posture, and the operational `WarpSubmissionReadAdapter`.
  2. **The Next Clean Sequence:** Remove landed items and set the next genuine strategic goals: implementing durable disk-backed CAS memoization in `git-cas` and establishing long-lived projection sessions in `WarpDashboardReadAdapter`.
  3. **Quick Start:** Rewrite the instructions to feature `xyph.ts` for graph dogfooding and explicitly document essential environment variables and configuration files (`.xyph.json`).

- **2.2. Missing Standard Documentation (New Focus):**
  1. `CODE_OF_CONDUCT.md`: Essential for setting community standards and governing participant interactions in a sovereign digital guild.
  2. `SECURITY.md`: Critical for defining vulnerability reporting procedures, Edict sandbox boundary security, and managing dependency overrides (like `flatted`).

- **2.3. Supplementary Documentation (Docs):**
  - `ControlPlaneService` and `MutationKernelService`: The intricate mechanism of capability-bound strand materialization and JSONL machine packet evaluation is currently locked inside massive 3,500+ line service implementations. It requires a dedicated supplementary architectural deep-dive at `docs/topics/control-plane-and-mutation-kernel/README.md`.

---

## 3. FINAL ACTION PLAN

- **3.1. Recommendation Type:**
  - **A. Recommend incremental updates to the existing `README` and documentation.** The high-level ontology, why Xyph, and system architecture diagrams are excellent. We need targeted incremental updates to fix the outdated sections and create the missing standard files.

- **3.2. Deliverable (Prompt Generation):**
  - A complete, ready-to-use prompt to apply the specific fixes from 2.1 and create the missing files identified in 2.2.

- **3.3. Mitigation Prompt:**
  ```text
  Execute an incremental documentation overhaul for Xyph v1.0.0-alpha.16:
  1. Update README.md: (a) Modify "What is Real Today" to highlight the current command-intent executor seam and operational WarpSubmissionReadAdapter; (b) Update "The Next Clean Sequence" to target durable disk-backed CAS memoization in git-cas and long-lived projection sessions in WarpDashboardReadAdapter; and (c) Enhance the "Quick Start" to document essential environment variables (XYPH_WORLDLINE_ID, XYPH_TEST_IN_MEMORY) and feature xyph.ts for graph dogfooding.
  2. Create CODE_OF_CONDUCT.md: Adopt the Contributor Covenant v2.1 tailored to sovereign digital guild participants.
  3. Create SECURITY.md: Define vulnerability disclosure procedures, Edict WASM sandbox security boundaries, and dependency override monitoring policies.
  Verify the changes by ensuring markdown formatting is pristine and committing with "docs(audit): overhaul README and establish standard community manifests".
  ```
