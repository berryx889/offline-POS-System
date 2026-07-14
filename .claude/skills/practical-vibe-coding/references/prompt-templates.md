# Lesson 6 — Build feature by feature: prompt templates & guardrails

This is where most of the build happens. Every feature follows the same loop with
the same prompt shape, so after a few reps you stop thinking about the loop and
just run it.

## The four-part prompt structure

Every prompt you write has these four parts, in this order:

1. **Anchor** — "Read AGENTS.md (CLAUDE.md) first and follow it strictly."
2. **Task** — one feature, one screen, or one integration. Not three.
3. **Constraints** — the lines that protect the parts of the app already built.
4. **Reference** — a design image if the task is visual; pasted documentation if
   the task involves an external library.

## The build loop

For every feature:
1. Write the prompt using all four parts.
2. Send it.
3. Read the diff.
4. Run the app. Test the new feature.
5. Test the previously built features. Confirm nothing regressed.
6. Commit if everything works.
7. If something broke, write **one targeted fix prompt**.

## Templates

### Building a UI screen
```
Read AGENTS.md first and follow it strictly.
Implement the [screen name] screen as shown in the attached design exactly,
using assets from the assets folder.
[Optional navigation requirement, e.g. "Add a navigation link from the home
route to open this screen."]
Do not change [thing to preserve].
[attached design image]
```

### Adding application state
```
Read AGENTS.md first and follow it strictly.
Integrate [feature] state. Store [data] using [state library] with [persistence].
[Behavior rule, e.g. "If an authenticated user has no selected branch, route
them to the branch selection screen."]
Preserve the existing UI exactly.
[Optional dev utility, e.g. "Add a button to clear local storage for testing."]
```

### Integrating a library or external service
```
Read AGENTS.md first and follow it strictly.
Study the existing [related code or flow], then [task] by following the
[library] documentation provided below.
Keep the existing UI and navigation flow intact.
Do not change the screen design.
Do not expose any secrets in the client app.
[paste current documentation]
```

### Fixing a specific issue
```
Read AGENTS.md first and follow it strictly.
The [thing] is [actual behavior]. It should [correct behavior].
Do not change any other behavior or layout.
```

## Constraint library

Drop whichever of these fit the task into the constraints section:

- "Do not change the screen design."
- "Preserve the existing UI exactly."
- "Keep the existing [feature] flow intact."
- "Do not expose any secrets in the client app."
- "Do not introduce new libraries without asking."
- "If a change is needed to make this work, ask first."
- "Match spacing, typography, and color exactly to the attached design."
- "Do not modify files outside [folder]."
- "Do not refactor existing code."
- "Do not add features that were not requested."

## Common mistakes (these quietly degrade the codebase)

- Bundling multiple features into one prompt.
- Asking for full-app generation in one prompt ("build me the whole app").
- Repeating project context in every prompt instead of relying on AGENTS.md.
- Asking the AI to "improve" or "clean up" working code — you get back a large
  rewrite you didn't want.
- Accepting AI output without running it first.
- Describing UI in words when a design image is available.

**Done for the whole lesson:** each feature has one prompt, one verification, and
one commit; the diff for any single commit is small enough to review at a glance.
