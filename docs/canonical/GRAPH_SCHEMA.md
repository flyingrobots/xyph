# GRAPH_SCHEMA.md
**Version:** 1.0.0
**Status:** AUTHORITATIVE

## 1. Node ID Grammar
Every node ID MUST follow the `prefix:identifier` format.
- **Prefix:** Lowercase string from the allowed taxonomy.
- **Identifier:** Case-preserving alphanumeric string (dashes and underscores allowed).

Example: `task:BDK-001`, `campaign:BEDROCK`

## 2. Prefix Taxonomy
| Prefix | Purpose | Example |
|--------|---------|---------|
| `roadmap` | The root container of all work. | `roadmap:ROOT` |
| `campaign` | High-level milestones or epochs. | `campaign:BEDROCK` |
| `feature` | Groups of related tasks. | `feature:BDK-SCHEMA` |
| `task` | Granular unit of work (Quest). | `task:BDK-001` |
| `artifact` | Output of a completed task (Scroll). | `artifact:task:BDK-001` |
| `spec` | Formal requirement or design doc. | `spec:GRAPH-SCHEMA` |
| `person` | Human participant. | `person:james` |
| `agent` | Digital mind participant. | `agent:james` |

## 3. Edge Type Semantics
| Type | Direction | Meaning |
|------|-----------|---------|
| `belongs-to` | Task → Campaign | Hierarchy: Quest is part of a Milestone. |
| `blocks` | A → B | Dependency: A must finish before B starts. |
| `depends-on` | B → A | Inverse dependency: B requires A. |
| `implements` | Code → Spec | Traceability: This logic fulfills that requirement. |
| `fulfills` | Artifact → Task | Completion: This scroll is the result of that quest. |
| `documents` | Doc → Node | Context: This file explains that node. |

## 4. Conflict Resolution (LWW)
XYPH uses **Last-Writer-Wins (LWW)** for all node properties.
The winner is determined by:
1. Higher Lamport timestamp.
2. Tie-break: Lexicographically greater `writerId`.
3. Tie-break: Greater patch SHA.

## 5. Non-Examples (Invalid)
- `BDK-001`: Missing prefix.
- `TASK:BDK-001`: Uppercase prefix.
- `task:`: Empty identifier.
- `unknown:ID`: Prefix not in taxonomy.
