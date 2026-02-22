# XYPH Visual Style Guide

> Canonical reference for XYPH's visual language across CLI and TUI surfaces.

---

## 1. Philosophy

XYPH's aesthetic is **clean, gradient-rich, and border-defined**. Every output should be unmistakably XYPH — whether it's a `boxen` frame in the terminal or an Ink panel in the dashboard.

The **Digital Guild** vocabulary is the thematic foundation. We don't have "tasks" and "milestones" — we have **Quests**, **Campaigns**, **Scrolls**, **Seals**, and **Intents**. The visual language reinforces this identity: progress bars shimmer with the brand gradient, sealed quests carry a `⊕`, and the WARP graph is always the single source of truth.

**Principles:**
- Gradient over flat color — the cyan→magenta sweep is our signature.
- Borders define hierarchy — rounded in TUI, single-line in CLI.
- Dim is a first-class color — secondary information recedes, primary information pops.
- Every glyph earns its place — no decoration without meaning.

---

## 2. Brand Gradient

**Primary gradient:** Cyan `rgb(0,255,255)` → Magenta `rgb(255,0,255)`

```
Cyan ████████████████████████████████████████ Magenta
 (0,255,255)          ↔          (255,0,255)
```

**Interpolation:** Linear RGB. For a bar of length `N`, position `i` maps to:
```
t = i / (N - 1)
r = round(0   + 255 * t)    // 0 → 255
g = round(255 - 255 * t)    // 255 → 0
b = 255                     // constant
```

**Positional mapping:** Color is determined by the slot's position in the bar, not by fill amount. A 10% bar shows cyan fills on the left; a 90% bar reveals magenta fills on the right. The gradient is the bar's identity, not a heat indicator.

**Application:**
- Progress bars (primary use)
- Potential future use: header accents, wordmark treatment

---

## 3. Color Palette

### 3.1 Status Colors

Defined in `src/tui/status-colors.ts`. Used by both TUI (Ink `color` prop) and CLI (chalk).

| Status             | Color     | Hex/Note                    |
|--------------------|-----------|-----------------------------|
| `DONE`             | green     | Completed, sealed           |
| `IN_PROGRESS`      | cyan      | Active work                 |
| `BACKLOG`          | gray      | Waiting, unstarted          |
| `BLOCKED`          | red       | Cannot proceed              |
| `PLANNED`          | yellow    | Scheduled but not started   |
| `INBOX`            | magenta   | Untriaged suggestion        |
| `GRAVEYARD`        | gray      | Rejected (+ strikethrough in CLI) |
| `PENDING`          | yellow    | Awaiting decision           |
| `APPROVED`         | green     | Review passed               |
| `REJECTED`         | red       | Review failed               |
| `UNKNOWN`          | white     | Fallback                    |

**Submission-specific statuses** (CLI only, in `render-status.ts`):

| Status               | Color     |
|----------------------|-----------|
| `OPEN`               | cyan      |
| `CHANGES_REQUESTED`  | yellow    |
| `MERGED`             | green     |
| `CLOSED`             | gray/dim  |

### 3.2 Semantic Colors

| Role      | Color   | Usage                              |
|-----------|---------|------------------------------------|
| Primary   | cyan    | Selection, active, IDs, accents    |
| Success   | green   | Sealed, approved, `[OK]`           |
| Error     | red     | Failures, blocked, `[ERROR]`       |
| Warning   | yellow  | Pending, caution, `[*]`, `[WARN]`  |
| Accent    | magenta | Intents, inbox, lineage            |
| Campaign  | blue    | Campaign headers                   |
| Secondary | dim     | Metadata, IDs, detail lines        |

### 3.3 Track / Empty State

- **Track color:** dark gray `rgb(80,80,80)` — used for unfilled progress bar slots
- **Empty text:** dim gray — used for "no items" states, inactive panels

---

## 4. Progress Bar

> **Status: LOCKED** — this specification is final.

### 4.1 Anatomy

```
 42% ████████████████████▒⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐
      ╰── fill (█) ──╯╰le╯╰───── track (⠐) ─────╯
```

- **Fill character:** `█` (U+2588 FULL BLOCK) — colored with positional gradient
- **Leading edge:** fractional shading at the boundary between fill and track
- **Track character:** `⠐` (U+2810 BRAILLE PATTERN DOTS-5) — dark gray `rgb(80,80,80)`
- **Label:** percentage right-justified in a 4-character column, then a space, then the bar

### 4.2 Leading Edge Thresholds

The fractional remainder at the fill boundary determines the edge character:

| Remainder    | Character | Name          |
|--------------|-----------|---------------|
| `< 0.25`     | (track)   | No partial    |
| `< 0.50`     | `░`       | Light shade   |
| `< 0.75`     | `▒`       | Medium shade  |
| `≥ 0.75`     | `▓`       | Dark shade    |

The edge character inherits the gradient color at that position.

### 4.3 Examples

```
  3% █░⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐
 42% █████████████████████⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐⠐
100% ██████████████████████████████████████████████████
```

(In terminal: fills render in cyan→magenta gradient; track renders in dark gray.)

### 4.4 Reference Implementation

See `scripts/bar-demo.ts` — a living demo that renders all track character variants with animation. Run with:

```bash
npx tsx scripts/bar-demo.ts
```

---

## 5. Icons & Symbols

### 5.1 Navigation

| Glyph | Usage                          | Color   |
|-------|--------------------------------|---------|
| `▶`   | Selected item / collapsed node | cyan    |
| `▼`   | Expanded node                  | cyan    |

### 5.2 Status Indicators

| Glyph | Meaning                    | Color   |
|-------|----------------------------|---------|
| `✓`   | Sealed / completed         | green   |
| `⊕`   | Guild-sealed (signed)      | green   |
| `○`   | Unsigned / pending         | yellow  |
| `⚠`   | Warning / orphan           | yellow or red |
| `↩`   | Previously rejected        | yellow  |

### 5.3 Tree Structure

| Glyph  | Usage                          |
|--------|--------------------------------|
| `├─`   | Branch (non-terminal child)    |
| `└─`   | Branch (terminal child)        |
| `│`    | Continuation line              |
| `◆`    | Intent node marker (magenta)   |

Indentation: `│  ` (pipe + 2 spaces) for continuation, `   ` (3 spaces) after terminal `└─`.

### 5.4 Miscellaneous

| Glyph | Usage                          |
|-------|--------------------------------|
| `—`   | Empty / N/A                    |
| `…`   | Truncation indicator           |
| `←`   | Tick progression (status line) |
| `─`   | Horizontal rule / separator    |

---

## 6. Borders & Containers

### 6.1 CLI (boxen)

```typescript
boxen(content, {
  padding: { top: 0, bottom: 0, left: 1, right: 1 },
  borderStyle: 'single',
  borderColor: 'cyan',
})
```

Standard padding is `0` vertical, `1` horizontal. Border style is always `single`.

### 6.2 TUI (Ink)

All Ink `<Box>` borders use `borderStyle="round"` (rounded corners).

### 6.3 Border Color Assignments

| Color   | Context                                  |
|---------|------------------------------------------|
| cyan    | Primary panels, detail views, help modal |
| magenta | Lineage view, inbox modals               |
| yellow  | Submissions view, warning modals         |
| green   | All-nodes view                           |
| gray    | Empty states, inactive panels            |
| red     | Error modals                             |

---

## 7. CLI Output Patterns

### 7.1 Message Prefixes

| Prefix    | Color  | Usage                                  |
|-----------|--------|----------------------------------------|
| `[OK]`    | green  | Successful operation                   |
| `[ERROR]` | red    | Operation failed                       |
| `[WARN]`  | yellow | Non-fatal issue, advisory              |
| `[FAIL]`  | red    | Expected operation that didn't succeed |
| `[*]`     | yellow | In-progress activity                   |

### 7.2 Detail Lines

Secondary information is rendered dim and indented 2 spaces:

```
[OK] Submission sub:abc123 created.
  Patchset:  patchset:abc123-1
  Branch:    feat/my-feature
  Quest:     task:do-the-thing
```

### 7.3 Headers

CLI headers use boxen with a bold label and dim detail line:

```
┌──────────────────────────────────────────┐
│ WARP Status — Roadmap                    │
│ 12 quests · 3 campaigns · tick 47        │
└──────────────────────────────────────────┘
```

### 7.4 Tables

Tables use `cli-table3` with:
- Headers: `chalk.white()` (plain white, no background)
- Empty `style.head` and `style.border` arrays (disable default styling)
- Explicit `colWidths` for alignment

---

## 8. Text Handling

### 8.1 Truncation

Long strings are truncated with an ellipsis character (`…`):

```typescript
const trunc = (s: string, n: number): string =>
  s.length > n ? s.slice(0, n - 1) + '…' : s;
```

Common truncation widths:
- Quest IDs: 16–20 characters
- Titles: 30–40 characters
- IDs in tables: 24–26 characters

### 8.2 Padding

Numbers right-align with `padStart`; IDs left-align with `padEnd`:

```typescript
String(hours).padStart(3)          // "  8"
quest.id.slice(0, 16).padEnd(18)   // "task:do-thing     "
```

### 8.3 Text Modifiers

| Modifier        | Usage                          |
|-----------------|--------------------------------|
| `bold`          | Headers, emphasis              |
| `dim` / `dimColor` | Secondary text, metadata    |
| `strikethrough` | GRAVEYARD status only          |

---

## 9. Layout

### 9.1 TUI Chrome

```typescript
const DEFAULT_CHROME_LINES = 4;  // status line + headers + footer
```

Available content height = terminal rows - chrome.

### 9.2 Split Panels

Inbox view uses a 40/60 split:

```typescript
const listHeight = Math.max(3, Math.floor(availableRows * 0.40));
const detailHeight = Math.max(0, availableRows - listHeight);
```

### 9.3 Scrollbar

Vertical scrollbar rendered as a single column in the right margin:

| Element | Character | Color |
|---------|-----------|-------|
| Thumb   | `█`       | cyan  |
| Track   | `░`       | gray  |

### 9.4 Status Line

Footer bar spanning full terminal width:

```
/// WARP [tick: 47 (a1b2c3d) ← 46 (e4f5g6h) | me: 12 | writers: 3] /////////////
```

Always dim. Padded with `/` to fill the terminal width.

### 9.5 Modal Input

Text input uses underscore as cursor:

```
> rationale text here_
```

---

## 10. Logo System

Logos load from `assets/` with size-responsive selection:

| Bucket   | Condition                      | Fallback |
|----------|--------------------------------|----------|
| `large`  | ≥ 100 cols AND ≥ 30 rows      | medium   |
| `medium` | ≥ 60 cols AND ≥ 20 rows       | small    |
| `small`  | < 60 cols OR < 20 rows        | `"XYPH"` |

Logo families: `xyph/`, `byFlyingRobots/`, `flyingRobotsTall/`, `flyingRobotsWide/`.

---

## 11. Open Design Questions

Items not yet decided — flagged for future design sessions:

- [ ] **Unified border style** — should CLI adopt `round` to match TUI, or keep `single`?
- [ ] **Header/wordmark gradient** — apply the cyan→magenta gradient to ASCII logo or header text?
- [ ] **Spinner design** — character set, color, and animation cadence for async operations
- [ ] **Table styling overhaul** — gradient row accents, better column alignment, responsive widths
- [ ] **Status badge rendering** — inline colored badges vs. prefix icons for status display
- [ ] **Progress bar in TUI** — bring the locked bar spec into Ink components
- [ ] **Separator styling** — standardize `─` repeat count or make it terminal-width-responsive

---

*Last updated: 2026-02-22*
*Source of truth for visual decisions. When in doubt, check `scripts/bar-demo.ts` for the living reference.*
