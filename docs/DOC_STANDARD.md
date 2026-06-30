# Documentation Product Standard: Reader-Task Edition

This standard defines the philosophy and structure for all documentation in the Xyph repository. 

## The Core Philosophy

Documentation in Xyph is a **product**. It is not a diary of what was built, but a tool designed to accomplish a job. 
In the "Reader-Task" paradigm, every document exists to serve a specific **Reader** who is trying to accomplish a specific **Task**. 

If a document does not clearly identify its reader and their task, it is defective.

## Principles

1. **Agent and Human Equality:** Readers include both human operators and autonomous AI agents. Documents must be parsable, deterministic, and highly structured so that an AI can recover context without ambiguity.
2. **Task-Driven:** Do not write "about" a topic. Write to "enable" a task. 
3. **The Graph is Truth:** Documentation should reflect the graph. It should point to the verifiable truth in the code and the graph, rather than attempting to duplicate state.
4. **Ruthless Brevity:** Eliminate filler. Use bullet points, bold text for key terms, and tables for structured data.

## Document Archetypes

Every document must fit into one of these archetypes, defined by the task it enables.

### 1. The Signpost (Orientation)
* **Reader:** A newcomer (human or agent) or someone who has lost context.
* **Task:** Understand "Where am I?", "What is this?", and "Where do I go next?".
* **Traits:** Short, declarative, heavily linked. 
* **Examples:** `README.md`, `GUIDE.md`, `AGENTS.md`.

### 2. The Doctrine (Rules & Methodology)
* **Reader:** An operator or agent about to perform work.
* **Task:** Understand *how* work is performed and the immutable constraints of the system.
* **Traits:** Authoritative, uncompromising, formatted as rules or checklists.
* **Examples:** `METHOD.md`, `TS_STANDARDS.md`.

### 3. The Blueprint (Architecture & Design)
* **Reader:** An implementer or auditor.
* **Task:** Understand the structural boundaries and design intents before modifying the system.
* **Traits:** Relies on diagrams (Mermaid), defines bounded contexts, states tensions and tradeoffs.
* **Examples:** `ARCHITECTURE.md`, `design/cycles/*`.

### 4. The Ledger (History & Proof)
* **Reader:** A debugger or reviewer.
* **Task:** Verify *what* changed, *when*, and *why*, or prove that a requirement was met.
* **Traits:** Chronological, immutable, linked directly to commits or graph nodes.
* **Examples:** `CHANGELOG.md`, `docs/audit/*`.

## The Anatomy of a Perfect Document

Every document must contain:

1. **The Title:** Clear and unambiguous.
2. **The Lede (Reader & Task):** A one-sentence summary of who this is for and what it helps them do.
3. **The Body:** The necessary information, grouped by logical sub-tasks.
4. **The Exit:** What the reader should do next, or links to related material.

## Anti-Patterns

* **The Recursive Walk:** Writing documents that require reading five other documents to understand the first one.
* **The "How it works" Essay:** Dumping technical implementation details in prose instead of relying on tests as the executable spec.
* **Orphan Documents:** Documents with no clear reader or task, usually written just because "we should have docs for this."
