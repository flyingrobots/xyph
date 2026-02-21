Alright, I read the git-warp docs you dropped **and** the AION papers. Two big takeaways before we talk command surface:

1. **git-warp already has most of the primitives you want**
    
    - **Time travel:** `materialize({ ceiling: tick })` + the whole `seek` cursor mechanism.
    - **Entity provenance:** `patchesFor(nodeId)` (built after `materialize()`).
    - **Holographic slicing:** `materializeSlice(nodeId)` = backward causal cone materialization.
    - **“Why did LWW choose that?” receipts:** `materialize({ receipts: true })` gives _applied vs superseded_ per op.
    - Caveat that matters: the **persistent seek cache** skips populating provenance index, so in “provenance mode” you want to **bypass cache** (git-warp itself calls this out).
        
2. AION Paper III is basically a manifesto for what you’re describing
    
    - **Patch vs receipt** is exactly “what happened?” vs “why did it happen that way?”
    - “Slicing” and “wormholes” map cleanly to: “show me only what caused this quest’s status” and “compress a whole milestone into one provenance-preserving blob.”

Now, `bin/xyph` brainstorming. Here’s what I think the CLI should be, how sovereignty should work, and how `xyph` with no args behaves.

---

## 1) `xyph` with no args should launch the TUI. Full stop.

If you want people to _live_ in the graph, the “home screen” has to be the TUI. Otherwise everyone keeps doing archaeology with `status` commands and never builds intuition.

So:

- `xyph` → launch TUI
- `xyph --tui` → same
- `xyph tui` / `xyph dashboard` → same

Everything else is an explicit subcommand.

(And yes: `npx tsx xyph-actuator.ts ...` in the README is a war crime. `bin/xyph` fixes that.)

---

## 2) Command surface: 3 tiers, not 2

Don’t do “human vs agent” as one boolean bucket. You want:

### A) Read-only (always safe)

No mutation, no sovereignty, no drama.

- `xyph status [roadmap|lineage|all|inbox]`
    - default view: `roadmap`
    - keep `--view` supported for backward compat if you want, but **positional is cleaner**: `xyph status lineage`
- `xyph whoami`
    - prints: resolved identity + **source** (like `git config --show-origin`)
- `xyph audit` (alias for `audit-sovereignty`)
- **Provenance / holography:**
    - `xyph history <nodeId>`  
        “Entity timeline” (patch list + interpreted lifecycle events)
        
    - `xyph prop <nodeId> <key>`  
        property-level history (powered by receipts)
        
    - `xyph slice <nodeId>`  
        show causal cone stats + (optional) open a focused view
        
    - `xyph diff <tickA> <tickB>`  
        roadmap-level diff
        
    - `xyph seek ...` / `xyph at ...`  
        time travel (more below)

### B) Mutations that are _authorized_ but not sovereign

These can be done by agents because they are downstream of a human intent.

- `xyph inbox ...` (suggestions can come from anyone)
- `xyph claim <questId>`
- `xyph seal <questId> --artifact ... --rationale ...`
- `xyph generate-key`
- (maybe) `xyph quest ...` **only if** you’re okay with agents creating backlog work directly  
    I’m not, by default. I’d rather agents create **inbox** suggestions and humans promote. More on that below.

### C) Sovereign / human-only / “touch grass” commands

These require:

- resolved identity is `human.*`
- **interactive terminal gate**
- **recorded provenance** (who/when) in the graph

These are the “LLMs must not cosplay humans” operations:

- `xyph intent ...`
- `xyph promote ...`
- `xyph reject ...`
- `xyph reopen ...`
- `xyph login ...` (writing identity config is _also_ a sovereignty-adjacent operation)

And any future “approval gate” command (Art. IV.2 territory) lives here too:

- `xyph approve <gateId> ...`

---

## 3) Human-only gating: do it properly or don’t bother

A weak TTY check is cute, but it’s not enough if stdin is piped.

Here’s the gate I’d ship:

### Sovereign command gate (must pass all)

1. **Identity must be `human.*`**  
    If you’re `agent.hal`, you don’t get to “intent”. Period.
    
2. **Require a real interactive terminal**
    
    - `process.stdin.isTTY && process.stdout.isTTY` must be true
    - and read confirmation **from `/dev/tty`**, not stdin  
        This blocks “echo CONFIRM | xyph intent ...” and blocks most agent tool runners.
        
3. **Interactive challenge**
    
    - Print a one-line summary of what you’re about to do (intent id + title, etc.)
    - Ask them to type a phrase like:  
        `I AM human.ada AND I AUTHORIZE THIS`
        
    - No `--yes`. If you want `--yes`, you didn’t want sovereignty.
        
4. **Graph provenance must record the human action**  
    If you gate “promote” but don’t record `promoted_by` + `promoted_at`, you’ve built a bouncer for a club with no guest list.

Also: if time-travel cursor is active (see below), sovereign commands should refuse to run. No “editing history” by accident.

---

## 4) Identity precedence: the intuitive stack (and why)

You asked for env var, git config local, `~/.xyph/xyphrc`, git config global, plus args.

Here’s the precedence I’d enforce (most specific wins):

1. `--as human.ada` (or `--as agent.hal`)
2. `XYPH_AGENT_ID` env var
3. `git config --local xyph.identity`
4. `~/.xyph/config` (or `~/.xyph/xyphrc`)
5. `git config --global xyph.identity`
6. else: **hard error** with a “here’s how to set it” message

Why this order?

- `--as` is the escape hatch.
- env var is the session override.
- git local is the “in this repo, I am X” default.
- `~/.xyph/config` beats git global because it’s explicitly XYPH-scoped (if you made a XYPH config file, you meant it).
- if none exist: don’t guess. Wrong identity is worse than a setup hurdle.

### Required UX: `xyph whoami` must show _source_

Example output:

- `human.ada (from git config --local xyph.identity)`
- or `agent.hal (from XYPH_AGENT_ID)`

That one line eliminates 90% of “why am I writing as agent.prime??” nonsense.

### `login` behavior

- `xyph login human.ada` → writes **local** by default
- `xyph login human.ada --global` → writes global
- `xyph login human.ada --user` → writes `~/.xyph/config`
- `xyph logout` clears local (and optionally `--global`, `--user`)

And yeah, `login human.*` should be a sovereign command (TTY + confirm). Otherwise an agent can “helpfully” set you to `human.ada` behind your back.

---

## 5) Time travel: don’t half-build this

You specifically want: “see the plan at commit XYZ”.

There are _two_ “XYZ”s in your universe:

- a **warp patch SHA / lamport tick** (graph history)
- a **code commit SHA** (repo history)

You need both, but don’t fake it.

### Primitive (always works): ticks

- `xyph seek --tick 123`
- `xyph seek --latest`
- `xyph seek --save <name>` / `--load <name>` / `--list`  
    (steal this directly from git-warp; it’s great)

When a cursor is active:

- all read commands show state at that tick
- **all mutating commands should refuse** (or require an explicit `--allow-mutate-in-past` that you probably shouldn’t implement)

### “At commit XYZ” (code commit) needs a bridge

If you want this to be deterministic and not vibes-based, you should **stamp every XYPH patch with the repo HEAD SHA** at the moment it was created.

Then:

- `xyph at --git <sha>` finds the latest tick whose patch metadata says `head=<sha>` (exact match)
- If no exact match, you can offer a “nearest before” mode, but label it as approximate (and I would make it opt-in).

This is straight out of the AION “patch boundary should be sufficient” mindset: the boundary should include enough metadata to reconstruct context.

### Provenance vs cache

Remember: git-warp warns that when you restore from persistent seek cache, **provenance queries like `patchesFor` / `materializeSlice` aren’t available**. So in XYPH:

- Normal time travel view can use cache (fast)
- The moment you open History/Slice/Receipts, you should **re-materialize without the persistent cache** for that view

That’s not a bug; that’s the cost of seeing the _why_.

---

## 6) My strong opinion on `quest` creation (agent vs human)

If you let agents create backlog quests directly, your roadmap becomes a junk drawer.

So I’d enforce:

- **Agents can create inbox items** (`xyph inbox ...`)
- **Humans promote** (`xyph promote ...`) (sovereign)

If you _really_ want agents to create structured quests, then make it explicit:

- `xyph quest ... --draft` creates in a DRAFT/INBOX state, not BACKLOG
- only humans can flip to BACKLOG via promote

That preserves the “humans decide what gets real” line without blocking agent decomposition.

---

## 7) Minimal “bin/xyph” campaign scope that actually ships value

If we keep the campaign tight but meaningful, the first cut should deliver:

- `xyph` binary (package.json `bin`) that:
    - runs TUI on no args / `--tui`
    - dispatches to actuator commands
    - resolves identity via precedence stack
    - implements the sovereign TTY + `/dev/tty` confirmation gate
- `xyph whoami` + `xyph login/logout`
- hard prohibition on mutation while a time-travel cursor is active (even if you don’t ship full travel yet)
- (optional but high leverage) record missing provenance fields like `promoted_by` / `promoted_at` everywhere they’re currently absent

Everything else (history/slice/diff/time travel UI) can be the next chunk, but the wrapper + identity + sovereignty gate is the foundation.

---

If you want my recommendation for the “???”:  
**Make `xyph status` stay CLI-text, make TUI the default home screen, and steal git-warp’s `seek` semantics almost verbatim.** It’s already the right mental model, and it’ll make your “time travel roadmap” feel inevitable instead of bolted on.

---

Yep — this **does** change (and sharpen) a few things we discussed, but in a good way.

## Does this change the `xyph` CLI surface?

**Mostly additive, but it upgrades the “meaning” of every mutating command.**

Your canonical docs make XYPH unambiguously a **planning compiler** whose roadmap is “compiled” through a deterministic pipeline, and where **`APPLY` is the only mutation gate**. That implies:

- Every “write” command (`intent`, `promote`, `reject`, etc.) should **materialize as a signed PlanPatch** with rationale + rollback, and then go through the **single write gate**.
- The CLI needs first-class concepts for **runs**, **simulation**, **review**, **approval gates**, **apply receipts**, and **rollback** (even if you keep ergonomic “shortcut” verbs like `xyph intent …`).
- Your earlier “TTY gate for human sovereignty” idea becomes _more than cute_: it becomes an ergonomic enforcement layer around **Human Sovereignty** and **Pipeline Ceremonies**.

So: **keep the `xyph intent / promote / claim / seal` verbs** (they’re great), but internally they’re “create patch → review/approve if required → apply → receipt”.

---

## TUI design principles (strong opinions)

If XYPH is a causal OS, the TUI is the cockpit. It must be:

1. **Always honest about mode**

- **LIVE vs PINNED (time travel)** must be screamingly obvious.
- If pinned: **no mutation**. Not “please don’t”; literally disabled. (“No write outside APPLY” + “no vibes-based success.”)

2. **Everything is a story with receipts**

- Every screen should let you jump to:
    - genealogy (intent lineage),
    - history (patch timeline),
    - receipts (why LWW picked a value),
    - diffs (what changed between two times).

3. **Sovereignty is a UX primitive**

- Human-only actions must feel like ceremonies:
    - show what you’re about to do,
    - require rationale,
    - require explicit confirmation,
    - record provenance (signed mutation, rollback).

4. **Command Palette > key soup**

- You’ll still have hotkeys, but the palette prevents “oh god what does ‘k’ do here”.

---

## What screens should exist?

Here’s the minimal set that matches your laws (compiler pipeline, sovereignty, provenance, time travel) without becoming a NASA control room.

### 0) Home: Control Tower

**Purpose:** “What should I care about right now?”  
**User can:**

- See _Ready Frontier_ (tasks with no unmet blockers).
- See active campaigns, critical path risk.
- See inbox count, pending approval gates, latest compiler runs.
- Jump anywhere with command palette/search.

### 1) Roadmap: Campaign → Task tree (+ detail panel)

**Purpose:** primary planning surface.  
**User can:**

- Browse campaign/task hierarchy, fold/unfold, filter by status/owner/risk.
- Open task detail (deps, lineage, artifacts/scrolls).
- Claim/seal (agent-safe).
- Create dependencies.
- Jump to history/slice/time travel from any selected node.

### 2) Inbox / Triage

**Purpose:** turn raw ideas into sovereign work.  
**User can:**

- View suggestions with **origin context**.
- Promote to backlog (human ceremony).
- Reject to graveyard (human ceremony + rationale).
- Attach/choose intent for promoted items (Genealogy of Intent stays clean).

### 3) Lineage (Genealogy of Intent)

**Purpose:** sovereign audit view.  
**User can:**

- Expand intent → campaign → task → scroll.
- Run sovereignty audit (highlight orphans / missing intent).
- Jump from any node into history, receipts, artifacts.

### 4) Time Travel (Seek Cursor)

**Purpose:** “Show me the plan as it was.”  
**User can:**

- Pin cursor to tick/commit checkpoint.
- Scrub time, diff pinned vs live.
- Open roadmap/lineage/etc at that pinned point.
- “Go live” instantly.

(And when pinned: the UI should look like the plane is in autopilot and the controls are behind glass.)

### 5) Provenance / Holographic Slice

**Purpose:** “Why is this property like this?”  
**User can:**

- Pick node + property → see full causal history.
- See receipts: which writes were applied vs superseded (conflict story).
- Slice a node: materialize its causal cone for forensic debugging.

### 6) Compiler Runs (Review → Emit → Apply)

**Purpose:** “Planning compiler as a first-class product.”  
**User can:**

- View run list and stage progression (`INGEST → … → APPLY`).
- Open artifacts per stage (digests, warnings/errors).
- See patch preview (ops + rollback + risk/confidence).
- Run **Simulation Mode** (through EMIT only).
- Apply only when approvals satisfied; show apply receipt + exit codes.

### 7) Trust & Identity

**Purpose:** “Who am I? who are you? can I trust this write?”  
**User can:**

- See resolved identity + source (local/env/flag).
- See trust mode (warn/enforce), run audit verification.
- Inspect writers and whether they’re trusted (especially critical if you’re serious about sealed work).

---

## Suggested global interaction model

**Persistent chrome:**

- **Top bar:** identity, trust mode, cursor mode (LIVE/PINNED), HEAD commit/tick.
- **Bottom bar:** contextual hotkeys + status (warnings, pending gates, etc.).

**Global tools:**

- `Ctrl+P` Command Palette (search actions + nodes)
- `/` quick filter/search within current list/tree
- `h` history modal for selected node
- `t` time travel view (or toggle pin/live)
- `?` help overlay

**Safety UX:**

- Any sovereign action must:
    - collect rationale (≥ 11 chars),
    - surface whether approval gate is required,
    - show rollback preview (because reversibility is law).

---

## SVG mockups

I made SVG wireframes for each screen (layout + labeled regions). Open the index to browse them quickly:

- **[Open the mockups index](sandbox:/mnt/data/tui_mockups_index.html)**

Individual screens:

- **[Home](sandbox:/mnt/data/tui_0_home.svg)**
- **[Roadmap](sandbox:/mnt/data/tui_1_roadmap.svg)**
- **[Inbox / Triage](sandbox:/mnt/data/tui_2_inbox.svg)**
- **[Lineage](sandbox:/mnt/data/tui_3_lineage.svg)**
- **[Time Travel](sandbox:/mnt/data/tui_4_time_travel.svg)**
- **[Provenance / Slice](sandbox:/mnt/data/tui_5_provenance.svg)**
- **[Compiler Run](sandbox:/mnt/data/tui_6_compiler.svg)**
- **[Trust & Identity](sandbox:/mnt/data/tui_7_trust.svg)**

---

## If you want my “build order” recommendation

To ship something **insanely compelling fast**:

1. **Home + Roadmap + Inbox** (with detail panel)
2. Add **History modal** everywhere (`h`)
3. Add **Time Travel pin/live** (even before fancy diff UI)
4. Add **Compiler Runs view** (simulation + patch preview)
5. Add **Provenance slice + receipts** (your killer differentiator)
6. Trust screen last (unless you’re already enforcing signatures today)

