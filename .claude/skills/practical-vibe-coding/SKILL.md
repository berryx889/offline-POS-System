---
name: practical-vibe-coding
description: >-
  A repeatable, disciplined workflow for building complete apps with an AI coding
  agent — from idea to shipped build — without the codebase drifting into chaos.
  Use this skill whenever the user is building or extending an application feature
  by feature, sets up a new project, asks for help structuring an AGENTS.md /
  CLAUDE.md, writes prompts to implement a screen or integration, or wants to keep
  an AI-assisted build consistent and reviewable. Trigger it even when the user
  doesn't say "vibe coding" — any time the work is "build this app step by step,"
  "add this feature," "scaffold the project," or "help me not break what already
  works," this is the operating system to run. Based on the "Practical Vibe Coding
  with AI" guide.
---

# Practical Vibe Coding

A system for building real apps with an AI agent. The AI writes most of the code,
but it works inside a small set of rules recorded once at the start, and every
change is small enough to verify before moving on. This is the antidote to the two
failure modes: **unstructured prompting** (fast at first, then the codebase rots)
and **endless planning** (architecture diagrams forever, app never ships).

The core belief in one line: **a prompt is not a random instruction — it is an
instruction with a defined scope.**

## When to use this

Run this workflow for any AI-assisted build. It is stack-agnostic — the original
guide targets Expo/React Native, but the same discipline applies to a Tauri
desktop app, a Next.js web app, a CLI, or a backend service. When you hit a lesson
that names a specific library, substitute the project's actual stack; the *shape*
of each lesson does not change.

## The mental model card

- **AGENTS.md is the source of truth.** (In Claude Code this is `CLAUDE.md`.)
- **One task per prompt.** One feature, one screen, or one integration — never three.
- **Constraints protect what's already built.**
- **Verify each step before moving on.**
- **When something breaks, write one targeted fix prompt** — never "clean up the app."
- One sentence describing the app before you start. One visual direction before
  generating assets. One commit per working feature.

The pipeline: **IDEA → DESIGN → GENERATE → STACK → SETUP → AGENTS.md → BUILD → SHIP**

## The seven lessons

Follow them in order the first time through a project. After setup you live almost
entirely in Lesson 6.

### Lesson 1 — Idea and design research
Know what the app looks like before writing code; the visual direction drives
component choices and layout.
- App idea in one sentence.
- List the core screens (5–8 for v1 is typical).
- Gather references (Pinterest for mood, Dribbble for screen polish, Mobbin for
  full real-app flows, Behance for case studies). Save 15–25.
- Pick **one** visual direction and describe it in one sentence.
- **Done:** a folder of references + a one-sentence description of the direction.

### Lesson 2 — Generate the visuals
Generate assets *before* building screens, so spacing and sizing come out right the
first time instead of being redone once real images land.
- Generate the brand element first (logo/mascot/hero). It becomes the style
  reference for everything else.
- Generate the rest in that same style; include empty, success, and error states.
- Export at the resolutions the platform needs and save to `assets/images/` with
  descriptive names (`empty_cart.png`, `logo_mark.png`).
- **Done:** every screen on the list has its assets generated and saved first.

### Lesson 3 — Pick your stack
Choose boring, well-documented, current libraries. AI produces better code for
established libraries because there is more consistent training data.
- Lock the framework, one styling system, one state library, one auth provider,
  one analytics tool. Skip a database for v1 unless there's a real reason.
- **Rule of thumb:** if the AI offers three different alternatives for one decision,
  the requirement is probably too custom — pick the most established option and move.
- **Done:** each layer has exactly one chosen library with a one-line reason.

### Lesson 4 — Project setup (once per project)
- Create the project via the framework's own scaffolder.
- `git init`, first commit message `init`.
- Add `.env` and `.env.example`; gitignore the local one.
- Install and configure styling in one prompt.
- Drop generated assets into `assets/images/`; create a centralized imports file.
- Wire up lint + typecheck commands and confirm they pass.
- Create AGENTS.md / CLAUDE.md (Lesson 5). Push to Git.
- **Done:** clean scaffold, lint+typecheck green, AGENTS.md committed.

### Lesson 5 — Write your AGENTS.md
One markdown file at the project root recording everything the AI needs: the role
it plays, the stack, conventions, architecture, and constraints. The AI reads it
before every feature so its guesses don't drift day to day. See
`references/agents-md-template.md` for a fill-in-the-blanks starter and the full
list of required sections.

### Lesson 6 — Build feature by feature
Where you spend most of your time. Every feature runs the same loop. See
`references/prompt-templates.md` for the four-part prompt structure, ready-to-use
templates, the constraint library, and the common mistakes to avoid. The loop:

> **Write the four-part prompt → send → read the diff → run the app and test the
> new feature → re-test previously built features → commit if everything works. If
> something broke, write one targeted fix prompt.**

### Lesson 7 — Test, polish, ship
The production build behaves differently than dev; catch the gaps before users do.
- Run the full primary flow on a real device/machine, not just the simulator.
- Test edge cases: empty states, long input, no internet/slow internet, denied
  permissions, power loss — whatever "the real world" means for this app.
- Run lint + typecheck, resolve everything, no `any` in TypeScript.
- Do a code-review pass on any feature the AI wrote in full.
- Remove dev utilities: test buttons, console logs, mock data, storage clearers.
- Add analytics on the flows that matter.
- Verify no secrets in the bundle or git history (run a secret scanner).
- Build a production binary and test it on real hardware before shipping.
- **Done:** production binary passes the primary flow on real hardware.

## How to actually run this as the agent

When the user is building with you, *be* the disciplined half of the loop:

1. Before implementing anything, read the project's AGENTS.md / CLAUDE.md and
   follow it strictly. If it doesn't exist yet, offer to write one (Lesson 5).
2. Take on **one** unit of work per turn. If the user asks for three features at
   once, build the first fully, verify it, then continue — don't half-build three.
3. State the constraints you're honoring ("not touching the payment flow, not
   installing new libraries") so the user can see what's protected.
4. After a change, say exactly how to test it, and confirm previously built
   features still work before calling it done.
5. Recommend a commit per working feature with a short, scoped message.
6. Ask before installing a new library or changing existing UI. If a decision is
   genuinely the user's, ask; otherwise pick the established default and proceed.

Keep changes small enough that the diff for any single commit can be reviewed at a
glance. That reviewability *is* the methodology.
