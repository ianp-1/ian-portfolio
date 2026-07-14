---
name: Ian Pang — Portfolio
description: A precise, calm, engineer's portfolio — editorial restraint with earned-on-interaction craft.
colors:
  bg: "#ffffff"
  bg-dark: "#131313"
  ink: "#1c1f1c"
  ink-dark: "#eceee9"
  surface: "#f6f7f5"
  surface-dark: "#1c1d1b"
  muted: "#6e716c"
  muted-dark: "#9a9d97"
  line: "#e4e6e1"
  line-dark: "#2c2e2a"
  accent: "#5e7f3a"
  accent-dark: "#93c15f"
typography:
  display:
    fontFamily: "General Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 6vw, 4.5rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "General Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "General Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "General Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
rounded:
  none: "0px"
  sm: "4px"
  md: "8px"
  full: "999px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "48px"
  xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
  project-row:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    padding: "24px 0"
  project-row-hover:
    textColor: "{colors.accent}"
  tag-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
---

# Design System: Ian Pang — Portfolio

## 1. Overview

**Creative North Star: "The Machined Page"**

A page that reads like a precision instrument's faceplate — a well-made oscilloscope, a mechanical keyboard, a machined aluminum enclosure. Everything is exact, quiet, and load-bearing. Nothing is decorative. The surface is calm and mostly still; the craft reveals itself only when you touch it. This is a portfolio where the *site itself is the work sample* — its speed, correctness, and restraint are the argument for the engineer behind it.

The system is **90% calm, 10% signature**. The base is editorial and typographic: generous whitespace, confident but restrained type, a near-monochrome surface. The single moss-green accent is rationed — it appears only in response to interaction (hover, focus, active), never as ambient decoration. The one place personality is allowed to concentrate is the **hover/detail micro-craft**: project rows that lift and reveal, links whose underlines wipe in, tags that cascade. Delight is earned on demand, not shouted in the hero.

This system explicitly **rejects the "AI slop" register**: no purple/blue gradient meshes, no floating blobs, no glassmorphism, no gradient text, no uniform fade-up-on-scroll applied to every section, no SaaS hero-metric template, no repeated identical icon-cards. It also deliberately sidesteps the *second-order* trap for a technical portfolio — the saturated "editorial-typographic" lane (display italic serif + ruled columns + tracked-mono kickers). There is no italic serif and no magazine grid here. The mono is legitimate (real systems/embedded/ML work), used for genuine metadata only, never as costume.

**Key Characteristics:**
- Editorial-typographic base, but sans-driven (no serif), so it dodges the saturated magazine lane
- Near-monochrome; a single rationed moss-green accent carries all hue
- Motion is interaction-triggered, not scroll-decorative
- Metadata set in mono (dates, tags, section indices) as real engineering texture
- Speed and correctness are treated as design features, not afterthoughts

## 2. Colors

Near-monochrome by doctrine: neutral surfaces at chroma 0, with a single moss-green accent that carries the entire hue budget. Warmth lives in the accent and type, never in the background.

### Primary
- **Moss Green** (`#5e7f3a` light / `#93c15f` dark · `oklch(0.52 0.13 132)` / `oklch(0.74 0.15 134)`): The only chromatic color in the system. Used strictly on interaction states — hovered project rows, link underlines, focus rings, the primary button's hover fill, active nav indicators. Never used as a large fill, never ambient. A distinctive, earthy green chosen specifically to avoid the AI-default blue/purple.

### Neutral
- **Ink** (`#1c1f1c` light · `oklch(0.20 0.01 150)`): Primary text and headlines on light backgrounds; the primary button fill. Near-black with a whisper of green tint so it feels of-a-piece with the accent, not clinical.
- **Paper** (`#ffffff` light · `oklch(1 0 0)`): The light-mode page background. Pure white, no hidden warmth.
- **Void** (`#131313` dark · `oklch(0.14 0 0)`): The dark-mode page background. Near-black at chroma 0 — no green tint here (hue belongs to the accent alone).
- **Off-white** (`#eceee9` dark · `oklch(0.93 0.005 150)`): Primary text in dark mode.
- **Surface** (`#f6f7f5` light / `#1c1d1b` dark): A barely-there raised tone for chips and subtle grouping. Tonal layering, not shadow.
- **Muted** (`#6e716c` light / `#9a9d97` dark · `oklch(0.50 0.01 150)`): Secondary text — dates, captions, supporting lines. Verified ≥4.5:1 on its background.
- **Line** (`#e4e6e1` light / `#2c2e2a` dark): Hairline dividers and borders (1px only).

### Named Rules
**The One Voice Rule.** The moss-green accent appears on ≤10% of any screen and *only* as a response to interaction. If green is visible before the user hovers, focuses, or activates something, it's wrong.

**The Neutral Ground Rule.** Backgrounds are chroma 0 (dark) or pure white (light). Hue lives exclusively in the accent. Tinting the background toward green is forbidden — that's the cliché.

## 3. Typography

**Display / Body Font:** General Sans (with `ui-sans-serif, system-ui, sans-serif` fallback)
**Label / Mono Font:** Geist Mono (with `ui-monospace, SFMono-Regular, monospace` fallback)

**Character:** A warm humanist grotesk paired with a precise, even-width mono. General Sans has just enough character to avoid feeling corporate while staying highly legible at every size; Geist Mono supplies the engineering texture for metadata. The pairing sits on a clear contrast axis (proportional humanist vs. monospaced technical), never two-similar-sans mush.

### Hierarchy
- **Display** (600, `clamp(2.75rem, 6vw, 4.5rem)`, lh 1.02, tracking -0.03em): The hero name and the one sharp positioning line. Capped at ~4.5rem — confident, not shouting. `text-wrap: balance`.
- **Headline** (600, `clamp(1.5rem, 3vw, 2rem)`, lh 1.1, tracking -0.02em): Section headers and project titles.
- **Title** (500, 1.125rem, lh 1.3): Experience roles, sub-headings.
- **Body** (400, 1rem, lh 1.6): Prose and descriptions. Max line length 65–75ch. `text-wrap: pretty`.
- **Label** (Geist Mono, 500, 0.8125rem, tracking 0.02em): Dates, tags, section indices (`01 / work`), the availability tag, nav meta. The mono is reserved for genuine metadata.

### Named Rules
**The Mono-Is-Metadata Rule.** Geist Mono is used only for real data points — dates, tech tags, indices, status. Never for headings, body copy, or decoration. Mono as costume is forbidden.

**The No-Italic-Serif Rule.** There is no serif in this system, and no italic display type. The moment a Fraunces/Newsreader-style italic headline appears, the page has collapsed into the saturated editorial lane. Prohibited.

## 4. Elevation

Flat by default. Depth is conveyed through tonal layering (Surface vs. Paper/Void) and hairline dividers, not ambient shadows. The only shadow in the system is a soft, low lift that appears *on hover* as part of the micro-craft — it is a response to state, never a resting decoration.

### Shadow Vocabulary
- **Hover-lift** (`box-shadow: 0 6px 24px -8px rgba(20,24,20,0.18)`): Applied to project rows / interactive cards on hover only, paired with a small `translateY(-2px)`. In dark mode, softened toward `rgba(0,0,0,0.5)`.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadow appears only as a response to hover/focus. If a card has a shadow before you touch it, it's a 2014 app — remove it.

## 5. Components

### Buttons
- **Shape:** Pill (`999px`, full radius) — the one soft shape in an otherwise square system, so CTAs read as tappable.
- **Primary:** Ink fill (`#1c1f1c`), Paper text, `12px 24px` padding. Used for the resume / primary contact CTA.
- **Hover / Focus:** Fill transitions to Moss Green (`#5e7f3a`) over ~180ms ease-out-expo; optional magnetic pull toward cursor (small JS island, ≤6px translate). Focus-visible: 2px accent ring, offset 2px.
- **Ghost / Secondary:** Transparent with 1px Line border; on hover, border and text shift to accent, no fill.

### Chips (tech tags)
- **Style:** Surface background, Muted text, pill radius, `4px 12px`, Geist Mono 0.8125rem. Flat, borderless.
- **State:** On the parent project-row hover, chips **stagger-cascade** (each with a ~30ms incremental delay) and their text shifts toward Ink; the row's own accent does the coloring work.

### Cards / Containers
- **Preferred affordance is NOT a card.** Selected work is a list of **rows** separated by hairlines, not a grid of boxes (avoids the identical-card-grid cliché).
- **Project row:** Full-width, `24px 0` padding, hairline divider below. Flat at rest.
- **Hover:** Row lifts (`translateY(-2px)` + Hover-lift shadow), title color → accent, an animated underline wipes in beneath the title (clip-path), a `→` arrow slides in from the left of the title or right edge, tag chips cascade. All reversible, all ≤250ms.

### Inputs / Fields (contact, if used)
- **Style:** No box. Underline-only fields (1px Line bottom border), transparent background, generous vertical padding.
- **Focus:** Bottom border animates to accent (width wipe from left), label lifts. No glow.

### Navigation
- **Style:** Sticky, minimal, transparent-to-backdrop on scroll. Name (left) · section links + resume↗ + theme toggle (right). Geist Mono for the section links.
- **States:** Default Muted; hover → Ink with an accent underline wipe; active section → persistent accent indicator that slides between items (view-transition or transform, not opacity swap).
- **Mobile:** Collapses to name + a minimal menu; links stack; no hamburger-overlay theatrics.

### Signature Component — The Selected-Work Row
The showpiece. A calm, flat list row that comes alive on hover: lift + shadow, title→accent, clip-path underline wipe, arrow slide, staggered tag cascade, and (optional) a peek of the project's accent swatch or thumbnail. This single interaction, executed precisely, is what makes the site read as hand-built. Everything else stays still so this reads clearly. Fully degrades under `prefers-reduced-motion` to an instant color/opacity change.

### Custom Cursor (accent voice, fine pointers only)
A 7px accent dot follows the pointer (fast lerp); a 36px hairline accent ring blooms only over interactive elements and contracts on press. Gated to `(pointer: fine) and (hover: hover)` with motion allowed — touch devices and reduced-motion users keep the native cursor untouched. The rAF loop sleeps once positions converge; input events wake it. This is the site's one indulgence and it speaks in the same accent voice as every other interaction.

### Section-Rule Glint
When a section header reveals, its bottom hairline draws in accent left-to-right (~0.8s ease-out-expo), then fades back to the neutral rule. A passing accent voice tied to scroll interaction — never a persistent colored border. Disabled under reduced motion (hairline stays neutral).

### Hero Meta — Location
A single mono line: `Boston, MA`. No availability/status line, no clock, no decoration. No "open to X" copy anywhere — this is a general portfolio, not a season-specific pitch.

## 6. Do's and Don'ts

### Do:
- **Do** keep the moss-green accent on ≤10% of any screen, and only on interaction states (The One Voice Rule).
- **Do** keep backgrounds neutral — pure white (`#ffffff`) or near-black chroma-0 (`#131313`). Let the accent carry all hue (The Neutral Ground Rule).
- **Do** set all metadata (dates, tags, indices, status) in Geist Mono; keep headings and body in General Sans.
- **Do** make Selected Work a hairline-separated list of rows, and pour the craft into that one hover interaction.
- **Do** ease with exponential out-curves (ease-out-expo/quart), 150–250ms for hover, no bounce/elastic.
- **Do** provide a `prefers-reduced-motion: reduce` alternative for every animation (crossfade or instant), and keep body text ≥4.5:1 contrast.
- **Do** treat speed as a design feature: ship near-zero JS, self-host fonts, no layout-shift.

### Don't:
- **Don't** use purple/blue gradient-mesh or floating-blob hero backgrounds. (PRODUCT.md anti-reference.)
- **Don't** use glassmorphism cards decoratively, or gradient text (`background-clip: text`). Ever.
- **Don't** apply uniform fade-up-on-scroll to every section — motion with no intent is the tell.
- **Don't** build the SaaS hero-metric template (giant gradient number + label + stat row).
- **Don't** repeat identical icon-heading-text card grids, or put a tracked-uppercase eyebrow / `01 02 03` marker above every section.
- **Don't** reintroduce the auto-scrolling skills marquee — use a calm static hover grid instead. (PRODUCT.md anti-reference.)
- **Don't** drift into the editorial-magazine lane: no italic serif display, no ruled three-column broadsheet grid.
- **Don't** use mono for anything but genuine metadata — mono as generic "developer" costume is banned.
- **Don't** write hype copy ("blazing-fast", "I build scalable solutions"). Lead with real numbers (The numbers-over-adjectives principle from PRODUCT.md).
