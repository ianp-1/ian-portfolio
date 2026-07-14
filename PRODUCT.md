# Product

## Register

brand

## Users

SWE recruiters, hiring managers, and technical interviewers evaluating Ian Pang (CS @ Purdue) for software engineering roles — this is a general personal portfolio, not a season-specific pitch (no "open to X" availability lines in the UI). They arrive from a resume, LinkedIn, or referral link, usually skimming on a laptop with limited time and several tabs open. Their job-to-be-done: within ~20 seconds, decide "is this person worth an interview?" — they need impact, stack, and credibility fast, plus one-click access to the resume PDF and GitHub. A secondary audience (research labs, hackathon peers) may go deeper, but hierarchy is optimized for the fast recruiter skim.

## Product Purpose

A single-page personal portfolio that presents Ian's work — industry and research experience (FedEx/Data Mine, Zhan Lab, Suga International), hackathon-winning projects (Nadir, Canopy, Obscurafy), and technical stack — as a fast, memorable, obviously-hand-crafted site. It replaces a Next.js build that felt templated. Success = a recruiter remembers the site, trusts the craft, and can reach the resume/GitHub without friction. The site itself is a work sample: its speed and polish are evidence of the engineer.

## Brand Personality

Precise, understated, technical. Three words: **crafted, calm, engineer.** The voice is confident without hype — real numbers over adjectives ("120 FPS, 20ms latency", not "blazing-fast"). Editorial restraint carries authority; monospace accents signal the systems/engineering background. Emotionally: the site should feel *intentional and trustworthy* — the quiet confidence of someone who sweats details. Delight is earned on interaction (hover-craft), never shouted in the hero.

## Anti-references

Explicitly NOT "AI slop" or a template. Avoid, hard:
- Purple/blue gradient-mesh or floating-blob hero backgrounds
- Glassmorphism cards used decoratively
- Gradient text (`background-clip: text`)
- Uniform fade-up-on-scroll applied to every section (motion with no intent)
- The hero-metric SaaS template (giant gradient number + label + stat row)
- Identical icon-heading-text card grids repeated endlessly
- Tiny uppercase tracked eyebrows / numbered `01 / 02` markers on every section
- Generic "I build scalable solutions" filler copy
- Skills marquee (the current site's borderline-slop auto-scroll tech logos) — replace with a calm static hover grid

Not a maximalist motion-forward site (Cuberto-style) either — motion is restrained and interaction-triggered.

## Design Principles

1. **The site is the work sample.** Speed, correctness, and polish are the argument. Zero jank, instant load, no broken states.
2. **90% calm, 10% signature.** Mostly still and editorial; a few intentional hover/detail moments that reward attention. Never animate for decoration.
3. **Numbers over adjectives.** Let concrete metrics and real project outcomes carry credibility. Cut hype words.
4. **Respect the 20-second skim.** Hierarchy serves a recruiter who may only read headings and one line each. Resume + GitHub always one click away.
5. **Craft is the differentiator.** Every hover, transition, and detail is deliberate — the hardest thing for a template or AI generator to reproduce, so it reads as personal.

## Accessibility & Inclusion

Target WCAG AA. Body text ≥4.5:1 contrast, large text ≥3:1, placeholders held to 4.5:1. Full keyboard navigation with visible focus states. All hover/detail motion degrades gracefully under `prefers-reduced-motion: reduce` (crossfade or instant, never blank). Semantic HTML and landmark structure for screen readers.
