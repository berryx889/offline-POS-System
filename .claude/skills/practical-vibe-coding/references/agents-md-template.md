# Lesson 5 — AGENTS.md / CLAUDE.md

A single markdown file at the project root that records everything the AI needs in
one place: the role it plays, the stack, conventions, architecture, and
constraints. The AI reads it before every feature. Without it, the AI re-guesses
your conventions every day and the inconsistencies compound across the codebase.

In Claude Code the equivalent file is `CLAUDE.md` — same content, same purpose.

You don't have to write everything up front. Start from this structure and update
it as features develop.

## Required sections

- **Role** — what kind of engineer the AI is acting as ("Senior Tauri + React
  desktop engineer").
- **Project overview** — what you're building, in 3–5 lines.
- **Tech stack** — exact libraries, with versions where they matter.
- **Development philosophy** — feature by feature, simplest version first, no
  overengineering.
- **Architecture** — folder structure with one line of purpose per folder.
- **UI rules** — replicate provided designs exactly; what not to approximate.
- **Styling rules** — the one styling system, when to fall back, the exception list.
- **State rules** — when global, when local, when to persist.
- **TypeScript rules** — strict mode, no `any`, simple readable types.
- **Asset rules** — centralized imports, naming conventions.
- **Secret rules** — never expose keys in client code; tokens come from server routes.
- **Decision rules** — ask before installing new libraries; ask before changing UI.
- **Final reminder** — the file must be read before every feature.

## Starter block

Copy into a new `CLAUDE.md` / `AGENTS.md` and fill the `[SQUARE_BRACKET]` fields:
`[APP_NAME]`, `[ONE_LINE_DESCRIPTION]`, `[FEATURE_LIST]`,
`[EXAMPLE_COMPONENT_NAMES]`, `[EXAMPLE_STATE_FIELDS]`. Everything else generalizes.

```markdown
You are an expert [STACK] engineer helping me build [APP_NAME].
Write clean, simple, maintainable code. Prioritize clarity over unnecessary
abstraction. Think like a senior developer.

## Project Overview
We are building [APP_NAME], [ONE_LINE_DESCRIPTION].
The app includes:
[FEATURE_LIST]
Keep the implementation simple and readable.

## Tech Stack
[EXACT LIBRARIES]
Do not introduce new major libraries unless there is a strong reason.
Ask before installing anything new.

## Development Philosophy
Build feature by feature. For every feature:
1. Read this file first.
2. Keep the implementation simple.
3. Avoid overengineering.
4. Prefer readable code over clever code.
5. Build the smallest useful version first.
6. Refactor only when repetition appears.

## Decision Making
If something is unclear or could be improved, suggest a better approach. If a new
library would significantly help, recommend it, explain why, and ask before adding
it. Do not install new libraries without approval.

## Architecture
[FOLDER STRUCTURE, one line of purpose per folder]
Screens compose components and call hooks/stores; they don't hold large reusable
UI blocks or business logic. Create a component when it's reused, makes a screen
easier to read, or is a clear UI concept (e.g. [EXAMPLE_COMPONENT_NAMES]). Don't
create components too early.

## UI Rules
Replicate the provided design exactly: layout, spacing, padding, font sizes and
hierarchy, colors, radius, shadows, alignment, proportions. Do not approximate or
simplify unless explicitly asked.

## Styling Rules
Use [STYLING SYSTEM]. Use the version installed in this project (check
package.json). Do not upgrade without approval. Reuse class patterns via shared
utilities. [Exception list for cases the styling system can't cover.]

## State Management
[STATE LIBRARY] for global client state. Local state for temporary UI state.
Persist [where], keep here: [EXAMPLE_STATE_FIELDS].

## TypeScript
Strict mode. No `any`. Keep types simple and readable.

## Feature Implementation
1. Read this file first. 2. Identify the files to change. 3. Keep changes focused.
4. Don't rewrite unrelated code. 5. Follow existing patterns. 6. Make the feature
work end to end. 7. Fix lint and type errors before finishing.

## Secrets
Never expose secret keys in client code. Use server routes for tokens and external
API access.

## Communication
Be concise. Explain what changed and how to test it.

## Final Reminder
Before every feature: read this file, follow it strictly, build clean simple code,
replicate UI exactly when designs are provided.
```
