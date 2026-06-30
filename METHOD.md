# METHOD

The Xyph work doctrine: A backlog, a loop, and honest bookkeeping.

## Principles

- **The agent and the human sit at the same table.** Both matter. Both are named in every design.
- **The graph is the plan.** Coordination happens through stigmergy—participants modify the shared environment (the WARP graph) and observe changes.
- **Dogfood the Graph.** The graph, not the filesystem, is the coordination layer. The CLI actuator (`xyph`) is used to record, move, authorize, and link completed work as native graph nodes.
- **Tests are the executable spec.** Design names the problem; tests prove the answer.
- **Reproducibility is the definition of done.** Results must be re-runnable proof, not static artifacts.

## Structure

| Signpost | Role |
| :--- | :--- |
| **`README.md`** | Public front door and project identity. |
| **`GUIDE.md`** | Orientation and productive-fast path. |
| **`BEARING.md`** | Current direction and active tensions. |
| **`VISION.md`** | Core tenets and the stigmergic mission. |
| **`ARCHITECTURE.md`** | Authoritative structural reference. |
| **`AGENTS.md`** | Context recovery protocol for AI and humans. |
| **`METHOD.md`** | Repo work doctrine (this document). |

## Backlog States

We don't use folders for state. We use the WARP graph to represent work items and their progression.

- **Inbox**: Raw ideas and uncommitted intents.
- **Backlog**: Technical debt, experiments, and queued work.
- **Ready**: Imminent work; pull into the next cycle.
- **Active**: Quests currently being executed.
- **Review**: Completed quests awaiting verification and merge.

## The Cycle Loop

![Cycle Loop](docs/diagrams/cycle-loop.svg)

1. **Pull**: Use the `xyph` CLI to query ready intents and pull work into an active quest.
2. **Branch**: Create a branch for the cycle.
3. **Red**: Write failing tests based on the intent's playback questions.
4. **Green**: Implement the solution until tests pass.
5. **Actuate**: Use the `xyph` CLI to formally record, authorize, and link the completed work as native graph nodes (e.g. submitting evidence).
6. **Ship**: Open a PR to `main`. Update `BEARING.md` and `CHANGELOG.md` after merge.
