<!-- SEED — re-run $impeccable document once there's code to capture the actual tokens and components. -->

---
name: EphOps Dashboard
description: Operational dashboard for AI-driven ephemeral environment provisioning and FinOps monitoring.
colors:
  bg-base: "#0f1117"
  bg-surface: "#161b22"
  bg-elevated: "#1c2128"
  border-subtle: "#21262d"
  border-default: "#30363d"
  text-primary: "#e6edf3"
  text-secondary: "#8b949e"
  text-muted: "#484f58"
  accent-blue: "#388bfd"
  state-running: "#3fb950"
  state-creating: "#d29922"
  state-failed: "#f85149"
  state-destroyed: "#484f58"
typography:
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  mono:
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "6px 16px"
  button-primary-hover:
    backgroundColor: "#58a6ff"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "6px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    padding: "6px 16px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.state-failed}"
    rounded: "{rounded.md}"
    padding: "6px 16px"
  status-running:
    backgroundColor: "oklch(25% 0.06 145)"
    textColor: "{colors.state-running}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  status-creating:
    backgroundColor: "oklch(22% 0.06 80)"
    textColor: "{colors.state-creating}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  status-failed:
    backgroundColor: "oklch(20% 0.07 25)"
    textColor: "{colors.state-failed}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  status-destroyed:
    backgroundColor: "oklch(18% 0.01 240)"
    textColor: "{colors.state-destroyed}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
---

# Design System: EphOps Dashboard

## 1. Overview

**Creative North Star: "The Operator's Terminal"**

EphOps is a tool for engineers who live in terminals and trust data over decoration. The visual system is built around the same principles as a well-configured terminal: dark, dense, precise, and completely unambiguous. Every element either carries information or creates space for information to breathe. Nothing decorates.

The palette is drawn from GitHub's dark theme — a deliberate choice. Engineers who use EphOps already trust that visual language. The surface is near-black (`#0f1117`), not pure black. Panels layer upward in subtle steps. Text is cool-white, not harsh white. The only color that matters is state color: green means running, yellow means creating, red means failed, gray means gone.

This system explicitly rejects the AWS Console's nested confusion, Jira's decorative complexity, and the SaaS dashboard cliché of hero metrics with gradient accents. EphOps data is operational. It is read under pressure, often at night, by someone who needs an answer in under 30 seconds.

**Key Characteristics:**
- Near-black base with layered dark surfaces (3 elevation steps, no shadows)
- State-only color vocabulary: 4 semantic states + 1 accent for actions
- Monospace font for all data values, IDs, costs, and timestamps
- Dense information layout — tables are features, not problems
- No decorative motion; transitions convey state change only

## 2. Colors: The Operator's Palette

A near-black base with cool-tinted neutrals and four semantic state colors. The accent blue is used exclusively for interactive actions.

### Primary (Action)
- **Action Blue** (`#388bfd`): Primary interactive actions only — buttons, links, active nav items, focus rings. Used on ≤10% of any screen. Its rarity signals "you can do something here."

### Neutral (Surfaces)
- **Base Canvas** (`#0f1117`): Page background. The floor everything sits on.
- **Surface** (`#161b22`): Cards, panels, sidebar background. One step above the canvas.
- **Elevated** (`#1c2128`): Table headers, hover states, dropdowns. Two steps above canvas.
- **Border Subtle** (`#21262d`): Dividers, table row separators. Barely visible.
- **Border Default** (`#30363d`): Component borders, input outlines.

### Neutral (Text)
- **Text Primary** (`#e6edf3`): All primary content — headings, table cell values, labels.
- **Text Secondary** (`#8b949e`): Supporting labels, column headers, metadata.
- **Text Muted** (`#484f58`): Placeholder text, disabled states, timestamps in low-priority contexts.

### Semantic States
- **Running Green** (`#3fb950`): RUNNING status only. Paired with a dark green tint background.
- **Creating Yellow** (`#d29922`): CREATING status only. Paired with a dark amber tint background.
- **Failed Red** (`#f85149`): FAILED status and error states. Paired with a dark red tint background.
- **Destroyed Gray** (`#484f58`): DESTROYED status. Same as muted text — it's gone, it's quiet.

### Named Rules
**The State-Only Color Rule.** Color communicates environment state (RUNNING / CREATING / FAILED / DESTROYED) and interactive affordance (Action Blue). It does not decorate. A metric card does not get a colored accent because it's "important." A section header does not get a colored border because it's "a section." If color is present, it means something specific.

**The No-Pure-Black Rule.** Never use `#000000` or `#ffffff`. The base is `#0f1117` (tinted toward cool blue). Text primary is `#e6edf3` (not white). This prevents harsh contrast that reads as "unfinished" on calibrated monitors.

## 3. Typography: Precision Stack

**UI Font:** Inter (with `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` fallback)
**Data/Code Font:** JetBrains Mono (with `'Fira Code', 'Cascadia Code', ui-monospace, 'SF Mono', Menlo, monospace` fallback)

**Character:** Inter carries all labels, headings, and navigation. JetBrains Mono carries all data — IDs, costs, timestamps, latency values, JSON output, agent reasoning. The split is semantic: if it's a value you might copy-paste or compare, it's monospace.

### Hierarchy
- **Heading** (600 weight, 16px, 1.4 line-height): Page titles, section headers. Used sparingly.
- **Body** (400 weight, 14px, 1.5 line-height): All prose, descriptions, form labels.
- **Label** (500 weight, 12px, 1.4 line-height, 0.01em tracking): Table column headers, badge text, metadata keys. Uppercase only for column headers.
- **Data/Mono** (400 weight, 13px, 1.6 line-height): All values — IDs, costs, timestamps, latency, JSON, agent output. Never use Inter for a value that has units or precision.
- **Code Block** (400 weight, 12px, 1.7 line-height): Multi-line agent reasoning, JSON output blocks.

### Named Rules
**The Mono-for-Values Rule.** Any value that has units, precision, or could be copy-pasted uses JetBrains Mono. This includes: UUIDs, ISO timestamps, cost figures, latency in ms, instance types, status strings in data cells. Labels and headings use Inter. The distinction is never ambiguous.

## 4. Elevation

This system is flat by default. Depth is conveyed through background color steps, not shadows. Three surface levels exist: Base (`#0f1117`), Surface (`#161b22`), Elevated (`#1c2128`). A sidebar sits on Surface. A dropdown or tooltip sits on Elevated. Nothing floats above Elevated.

Borders (`#30363d`) define component edges. Dividers (`#21262d`) separate rows and sections. No `box-shadow` on resting components.

### Named Rules
**The Tonal Depth Rule.** Elevation is expressed through background color, not shadow. If you need to show that something is "above" something else, use the next surface step. If you've run out of steps, you've nested too deeply — flatten the structure.

**The Flat-at-Rest Rule.** Shadows appear only as focus rings (for accessibility) and on transient overlays (dropdowns, tooltips, modals). No resting card has a shadow.

## 5. Components

### Buttons
- **Shape:** Gently rounded (6px radius)
- **Primary:** Action Blue background (`#388bfd`), white text, 6px/16px padding. Used for the single most important action on a screen (Provision, Terminate confirm).
- **Hover:** Lightens to `#58a6ff`. Transition: 150ms ease-out.
- **Ghost:** Transparent background, secondary text color. Used for secondary actions (Refresh, Cancel, Back).
- **Danger:** Transparent background, Failed Red text (`#f85149`). Used for destructive actions (Terminate) before confirmation.
- **Focus:** 2px offset ring in Action Blue. Always visible — never hidden.
- **Disabled:** 40% opacity. No pointer events.

### Status Badges
Four variants, one per environment state. Each is a small pill (4px radius, 2px/8px padding) with a tinted background and the matching state color text. Text is 12px Inter 500 weight, uppercase.
- RUNNING: dark green tint bg + Running Green text
- CREATING: dark amber tint bg + Creating Yellow text
- FAILED: dark red tint bg + Failed Red text
- DESTROYED: near-base bg + Destroyed Gray text

### Data Tables
- **Header row:** Elevated background (`#1c2128`), Label typography (12px Inter 500, uppercase, secondary text color), 12px/16px padding.
- **Data rows:** Surface background (`#161b22`), 12px/16px padding, subtle border bottom (`#21262d`).
- **Hover row:** Elevated background (`#1c2128`). Transition: 100ms.
- **Clickable rows:** Cursor pointer. No underline — the hover state is the affordance.
- **ID columns:** Monospace, truncated to 8 chars with `font-variant-numeric: tabular-nums`.
- **Cost columns:** Monospace, right-aligned, 6 decimal places.
- **Timestamp columns:** Monospace, locale-formatted.

### Metric Cards
Flat surface panels (`#161b22` background, `#30363d` border, 8px radius). A metric card contains: a label (12px Inter 500, secondary text), a value (20px Inter 600, primary text for counts; 16px JetBrains Mono for costs and latency), and optionally a sub-label (12px Inter 400, muted text).

No gradient accents. No colored borders. No icons unless they carry semantic meaning (error icon on a failed state). The value is the hero.

### Inputs / Fields
- **Style:** Surface background (`#161b22`), default border (`#30363d`), 6px radius, 8px/12px padding, 14px Inter.
- **Focus:** Border shifts to Action Blue (`#388bfd`). No glow, no shadow — the border change is sufficient.
- **Error:** Border shifts to Failed Red (`#f85149`). Error message below in 12px Failed Red text.
- **Disabled:** 50% opacity, no pointer events.
- **Textarea (prompt input):** Same treatment, min-height 80px, monospace font for the value.

### Navigation (Sidebar)
- **Background:** Surface (`#161b22`), full height.
- **Nav items:** 14px Inter 400, secondary text color, 8px/12px padding, 6px radius.
- **Active item:** Elevated background (`#1c2128`), primary text color, Action Blue left indicator (2px, not a stripe — it's a 2px border-left on the active item only, which is a state indicator, not decoration).
- **Hover:** Elevated background, no color change on text.
- **Mobile:** Collapses to hamburger at 768px. Overlay drawer, not push.

### Log Entries (Collapsible)
- **Collapsed:** Single row showing timestamp (mono), toolCalled (label badge), durationMs (mono), envId link (mono, truncated). Chevron right.
- **Expanded:** Full agentReasoning and output in a code block (12px JetBrains Mono, `#1c2128` background, `#30363d` border, 8px radius, 16px padding). JSON output gets syntax highlighting: keys in secondary text, strings in Running Green, numbers in Action Blue, booleans in Creating Yellow.
- **Transition:** Height expand, 150ms ease-out. No fade — the content appears as the height opens.

## 6. Do's and Don'ts

### Do:
- **Do** use `#0f1117` as the base canvas and layer surfaces upward in exactly three steps.
- **Do** use JetBrains Mono for every value that has units, precision, or could be copy-pasted: IDs, costs, timestamps, latency, instance types, JSON.
- **Do** pair every status color with a tinted background of the same hue — never a colored badge on a neutral background alone.
- **Do** use Action Blue (`#388bfd`) exclusively for interactive affordances: buttons, links, active nav, focus rings.
- **Do** show skeleton loading states (not spinners) for table rows and metric cards while data is in-flight.
- **Do** include a named error state with a retry action on every component that fetches data.
- **Do** display all timestamps in the user's local timezone using `Intl.DateTimeFormat`.
- **Do** use 150ms ease-out for all state transitions. No bounce, no elastic, no spring.
- **Do** confirm destructive actions (Terminate) with an inline confirmation — not a modal.

### Don't:
- **Don't** use the AWS Console pattern of nested sidebars, multi-level dropdowns, or more than two clicks to reach any data.
- **Don't** use Jira-style color decoration — colored section headers, colored card borders, colored icons for non-state purposes.
- **Don't** use the hero-metric template: big number, gradient accent, supporting stats. Metric cards are flat, borderless, and value-forward.
- **Don't** use gradient text (`background-clip: text`). Never.
- **Don't** use `border-left` greater than 1px as a colored accent stripe on cards, list items, or callouts. The 2px active nav indicator is a state marker, not decoration — it is the only exception.
- **Don't** use glassmorphism, blur effects, or frosted panels.
- **Don't** use display fonts, decorative serifs, or variable-weight animations in UI labels or data cells.
- **Don't** animate layout properties (height, width, top, left). Animate opacity and transform only.
- **Don't** use color to convey state without a text or icon fallback — color-blind users must be able to read RUNNING/FAILED from the badge text alone.
- **Don't** persist the admin API key in localStorage or any browser storage.
- **Don't** show raw stack traces or internal error details. Name the problem, offer the recovery.
