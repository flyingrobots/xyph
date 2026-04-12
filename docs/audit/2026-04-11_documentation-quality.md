# AUDIT: DOCUMENTATION QUALITY (2026-04-11)

## 1. ACCURACY & EFFECTIVENESS ASSESSMENT

- **1.1. Core Mismatch:**
    - **Answer:** The root `README.md` previously used the word "Substrate" extensively, which has been purged in the latest overhaul to favor "Bedrock" and "Medium." The most significant remaining mismatch is the `Milestone Spine` table in the README, which lists "WEAVER" as Milestone 7 (DONE) but "TRACEABILITY" as Milestone 11 (IN PROGRESS), while the code already contains advanced traceability scanning and DAG analysis.

- **1.2. Audience & Goal Alignment:**
    - **Answer:**
        - **Target Audience:** High-output software teams and AI agent operators.
        - **Top 3 Questions addressed?**
            1. **"What is the Digital Guild model?"**: Yes (Core Concepts in README).
            2. **"How do I orchestrate agents?"**: Yes (`AGENTS.md` and `AGENT_PROTOCOL.md`).
            3. **"How do I audit sovereignty?"**: Yes (`GUIDE.md` and Sovereignty Audit section).

- **1.3. Time-to-Value (TTV) Barrier:**
    - **Answer:** The complexity of the identity system (`human.` vs `agent.`). While the README explains it, the "Quick Start" doesn't emphasize that a `login` is effectively required for meaningful graph mutation history.

## 2. REQUIRED UPDATES & COMPLETENESS CHECK

- **2.1. README.md Priority Fixes:**
    1. **Milestone Realignment**: Update the Milestone Spine to reflect the actual implementation status of Weaver and Traceability.
    2. **Control Plane Visibility**: Elevate the JSONL Control Plane (`xyph api`) as a first-class agent ingress rather than a secondary "control plane" section.
    3. **TUI Cockpit Navigation**: Add a scannable key-binding table for the TUI to the main README to reduce time-to-value for human operators.

- **2.2. Missing Standard Documentation:**
    1. **`SECURITY.md`**: Exists, but lacks specific guidance on Ed25519 Guild Seal key management and vault integration.
    2. **`docs/design-system/README.md`**: Essential for maintaining lane and page consistency in the Bijou-powered cockpit as new data-viz primitives are added.

- **2.3. Supplementary Documentation (Docs):**
    - **Answer:** **Digital Guild Lifecycle**. A single, high-signal document explaining the state transitions from Intent to Quest to Submission to Scroll, including the invariants that gate each transition.

## 3. FINAL ACTION PLAN

- **3.1. Recommendation Type:** **A. Incremental updates to the existing README and documentation.** (The core has been overhauled; now it needs precision alignment).

- **3.2. Deliverable (Prompt Generation):** `Align the Milestone Spine with current repo truth. Create 'docs/DESIGN_SYSTEM.md' for cockpit consistency. Draft the 'Digital Guild Lifecycle' manifest detailing state transitions and sovereignty gates. Refine SECURITY.md for Guild Seal management.`

- **3.3. Mitigation Prompt:** `Update 'README.md' Milestone Spine status for Weaver and Traceability. Create 'docs/DIGITAL_GUILD_LIFECYCLE.md' explaining the causal chain from Intent to Scroll. Update 'SECURITY.md' to include Ed25519 key protection guidance and reference the '@git-stunts/vault' integration.`
