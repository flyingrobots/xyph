# Advanced Guide — Xyph

This is the second-track manual for Xyph. Use it when you need the deeper doctrine behind worldlines, braiding, and governed settlement.

For orientation and the productive-fast path, use the [GUIDE.md](./GUIDE.md).

## Worldline Doctrine

Xyph treats the shared graph as a living environment. `worldline:live` is the primary truth that humans and agents react to. Derived worldlines exist to preserve **signal hygiene** during speculative or disruptive work.

- **Speculative Continuation**: A derived worldline is a candidate continuation of the plan, not just a draft.
- **Braided Execution**: Keeping multiple worldline effects co-present without a formal merge. One line advances while another's completed effects stay visible.
- **Governed Settlement**: The process of "collapsing" a speculative worldline into `worldline:live` after formal review and attestation.

## The JSONL Control Plane

For automation and agentic work, Xyph exposes a versioned API. This allows for precise graph manipulation and speculative worldline management.

### Example: Forking Reality
```bash
printf '%s\n' \
  '{"v":1,"id":"f1","cmd":"fork_worldline","args":{"newWorldlineId":"worldline:speculative-fix"}}' \
  | node ./xyph.ts api
```

### Canonical Commands
- `observe`: Query graph projections (summary, conflicts, context).
- `apply`: Execute primitive mutations (nodes, edges, properties).
- `compare_worldlines`: Generate a factual divergence preview.
- `collapse_worldline`: Execute governed settlement into live.

## Digital Guild Ontology

Xyph enforces a strict workflow model. Every node type has a specific role in the genealogy of intent:

| Type | Role | Requirement |
| :--- | :--- | :--- |
| **Intent** | Causal Root | Must be human-authored. |
| **Campaign** | Strategy Container | Groups related Quests. |
| **Quest** | Unit of Work | Must trace to an Intent. |
| **Submission** | Review Envelope | Captures patchsets and verdicts. |
| **Scroll** | Sealed Artifact | Cryptographically signed via Guild Seal. |

## Performance & Scaling

Xyph uses a "window-based" read model via `git-warp` to avoid whole-graph materialization. This ensures the TUI cockpit remains responsive even as the graph grows to thousands of patches.

---
**The goal is inevitably. Every feature is defined by its tests.**
