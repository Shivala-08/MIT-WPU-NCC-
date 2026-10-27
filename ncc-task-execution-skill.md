---
name: ncc-task-execution
description: Execute small, safe, reviewable tasks for the MIT-WPU NCC website using AI-assisted development. Use for implementation, bug fixes, tests, refactors explicitly requested by the user, and pull-request preparation.
---

# NCC Website — AI Task Execution Skill

## Mission

Complete one clearly scoped task efficiently without breaking existing behavior, crossing ownership boundaries, weakening security, changing the agreed stack, or creating unnecessary work.

This skill is for the MIT-WPU NCC website built by two people using AI coding tools. Follow the repository's current source of truth. Do not assume this document overrides newer project decisions.

## 1. Source of truth and fixed architecture

Before changing code, read the relevant files in this order when they exist:

1. `PROJECT_RULES.md`
2. `AGENTS.md` and any applicable agent/skill instructions
3. The relevant requirement, GitHub issue, or exact task description
4. `docs/architecture.md`
5. `docs/api.md`
6. `docs/database.md` or generated database types
7. `docs/testing.md`
8. The code and tests for the feature being changed

The agreed stack is:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth, PostgreSQL, Row Level Security (RLS), and Storage
- Vercel hosting
- Existing project dependencies only, unless a human approves adding one

Do not switch frameworks, replace the authentication design, introduce Prisma/NextAuth, or add a new dependency without explicit approval.

If the repository's actual implementation conflicts with this document, stop and report the discrepancy rather than silently migrating the architecture.

## 2. Security rules — never bypass

- Never put secrets in source code, prompts, logs, screenshots, commits, or client-visible environment variables.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser or place it in a `NEXT_PUBLIC_` variable.
- On the server, establish the current user from Supabase's verified session using the project's approved authentication helper (normally `supabase.auth.getUser()`); never trust a user ID, role, or status supplied in the request body.
- Every protected API route and server action must enforce authentication and authorization on the server.
- Admin and officer permissions must be checked server-side on every privileged operation. Hiding a button in the UI is not authorization.
- Keep RLS enabled for every table that contains protected data. Never disable RLS to make a test or query pass.
- Cadets must not be able to change their own role, approval status, or other admin-controlled fields.
- Validate request bodies, query parameters, uploaded file types, file sizes, and IDs on the server.
- Use least privilege. Return only fields the caller is allowed to see.
- Private photos and study materials must not become public assets. Follow the existing private-bucket and signed-URL design.
- Do not log tokens, secrets, private profile data, or unnecessary personal information.
- Never run destructive database commands, reset a database, alter production data, or apply a production migration without explicit human approval.
- Use the development Supabase project and test data for implementation and experiments.
- If a task appears to require a security exception, stop and explain why. Do not invent a workaround.

## 3. Task intake: define the finish line first

Before editing anything, identify:

- **Goal:** What user-visible or technical outcome is requested?
- **Scope:** Which exact behavior is included?
- **Allowed files:** Which files may be changed?
- **Forbidden areas:** What must not be changed?
- **Dependencies:** Which API contract, schema, component, or decision is needed?
- **Acceptance criteria:** What observable evidence proves the task is complete?
- **Verification:** Which commands and manual checks are appropriate?
- **Risk:** Does the task touch authentication, roles, RLS, migrations, private files, personal data, or production configuration?

If the task is ambiguous in a way that could affect architecture, permissions, schema, or product behavior, ask a concise clarification before implementation. For a low-risk ambiguity, choose the smallest reversible interpretation and state the assumption.

Do not expand the task into unrelated cleanup, redesign, refactoring, or dependency upgrades.

## 4. Inspect before you edit

1. Check the current branch and working tree.
2. Do not overwrite, discard, or reformat pre-existing user changes.
3. Inspect the relevant implementation and nearby tests.
4. Search for existing helpers, validation patterns, API conventions, and reusable components.
5. Identify the smallest set of files needed.
6. Check whether another person or branch owns the files.
7. If the requested task overlaps another person's active work, stop and coordinate rather than editing their files.

Useful commands, where applicable:

```bash
git status --short
git branch --show-current
git diff --stat
```

Do not assume a clean working tree. Preserve any changes that were already present before your task.

## 5. Make a short plan before coding

First report a brief plan containing:

1. The approach
2. The files expected to change
3. Relevant risks or dependencies
4. The tests/checks to run

For routine, low-risk tasks, proceed after presenting the plan if the user's workflow allows it. For security-sensitive changes, migrations, or destructive actions, obtain explicit approval before taking the risky step.

## 6. Implement in small, reviewable steps

- Make the smallest complete change that satisfies the acceptance criteria.
- Prefer existing patterns and helpers over new abstractions.
- Keep types precise; avoid `any`, unsafe casts, and ignored TypeScript errors unless there is a documented reason.
- Handle loading, empty, success, validation-error, unauthorized, and unexpected-error states where relevant.
- Keep UI mobile-first and verify at 360px width. Use accessible labels, keyboard behavior, visible focus, and appropriately sized touch targets.
- Keep API responses consistent with `docs/api.md`. If the contract must change, update the contract and coordinate with the other builder before implementation.
- Do not create mock production behavior, fake authentication, demo credentials, or placeholder success responses to make a task appear finished.
- Do not silently change environment variables, deployment settings, database schema, or authentication flow.
- Do not run multiple agents against the same files or shared mutable resource at the same time.
- If using parallel agents or Git worktrees, give each agent a separate task, branch/worktree, explicit file list, and acceptance criteria.
- Commit only when asked or when the team's workflow explicitly requires it. Never include unrelated files in a commit.

## 7. Database and API rules

For database changes:

1. Only Person A owns and writes `supabase/migrations`.
2. Review the existing schema and migration history before proposing a change.
3. Create a forward migration; do not edit an already-applied migration unless the team explicitly authorizes a safe correction process.
4. Include appropriate constraints, indexes, grants, and RLS policies.
5. Consider access as anonymous, cadet, officer, and admin.
6. Update generated database types and `docs/database.md` if required by the repository's workflow.
7. Test with development data. Do not claim a migration is safe merely because it compiles.

For API changes:

1. Document method, path, authentication requirement, authorization rules, request shape, response shape, and expected errors in `docs/api.md`.
2. Derive the user from the verified session.
3. Validate inputs on the server.
4. Return appropriate status codes and avoid leaking internal error details.
5. Add tests for both allowed and denied access.
6. Coordinate contract changes with Person B before merging.

## 8. Test based on risk, not optimism

Run the narrowest relevant checks first, then broader checks when feasible.

Typical checks, if defined by the project:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Do not claim a command passed unless you actually ran it and observed a successful result. If a command is unavailable or fails for an unrelated existing reason, report that accurately.

For UI changes, check:

- Relevant route renders without console errors
- Loading, empty, success, and error states
- Logged-out and logged-in behavior where relevant
- Cadet, officer, and admin behavior where relevant
- 360px mobile layout and a wider viewport
- Keyboard access and form labels

For protected data or privileged actions, explicitly test denial cases:

- Anonymous user
- Cadet attempting an officer/admin action
- Officer attempting an admin-only action
- User attempting to read or modify another user's protected data
- Invalid or missing input
- Duplicate/replayed attendance scan or other relevant abuse case

For file uploads, test invalid file types, oversized files, and unauthorized access.

For any security-sensitive task, a passing build is not sufficient evidence.

## 9. Review your own diff

Before declaring completion:

```bash
git status --short
git diff --check
git diff --stat
git diff
```

Review for:

- Changes outside the task scope
- Accidental deletion or unrelated formatting
- Secrets, tokens, credentials, or personal data
- Weakened authorization or RLS
- Client exposure of server-only values
- Missing input validation or error handling
- Unhandled loading/empty/error states
- Tests that do not actually assert the behavior
- Dependencies added without approval
- Debug code, temporary bypasses, fake data, or TODOs introduced unintentionally

Do not revert other people's changes. If you find pre-existing issues, report them separately instead of expanding scope.

## 10. Definition of done

A task is done only when all applicable items are true:

- The requested behavior matches the acceptance criteria.
- Only authorized, relevant files were changed.
- The API contract, schema, or documentation was updated if needed.
- Relevant tests and checks were run, and results are reported truthfully.
- Protected behavior was tested for unauthorized access where relevant.
- UI changes work at 360px and have sensible loading/error states.
- No secrets or production data were exposed.
- The diff was reviewed for unrelated changes.
- Remaining risks, blockers, and untested paths are disclosed.
- The change is ready for another person to review.

Never say “fully tested” if only a build or a single happy path was checked.

## 11. Handoff and pull-request summary

When finished, provide a concise report using this format:

```text
TASK
<one-line summary>

IMPLEMENTED
- <important behavior/change>

FILES CHANGED
- <file>: <reason>

VERIFICATION
- <command/check>: PASS / FAIL / NOT RUN
- <manual scenario>: PASS / FAIL / NOT RUN

SECURITY / DATA NOTES
- <relevant authorization, RLS, migration, or privacy considerations>

KNOWN LIMITATIONS
- <remaining issue, assumption, or untested behavior; or "None known">

HANDOFF
- <what the other builder should review or do next>
```

If preparing a pull request, include:

- What changed and why
- How to test it
- Screenshots or preview link for UI changes, when available
- Database migration notes, if applicable
- Any linked issue
- Known limitations

Do not merge your own change or claim human review has occurred unless it actually has.

## 12. Collaboration contract for the two builders

- **Person A owns:** `supabase/migrations`, `src/lib/supabase`, `src/lib/guard.ts`, `middleware.ts`, `src/app/api/**`, `.github/workflows`, `.env.example`.
- **Person B owns:** `src/components`, page UI under `src/app`, styles, public assets, and written content.
- **Shared:** generated database types and `docs/`.
- Only Person A writes database migrations.
- Person A defines API contracts before Person B builds against real endpoints.
- Person B may build against mock data while Person A implements the API.
- Neither person changes the other person's owned files without prior coordination.
- One task per branch and pull request. Keep PRs small enough to review quickly.
- The other person reviews the PR and tests the deployed preview before merge.
- Both people retain appropriate access to project accounts; secrets are stored in approved secret managers or environment settings, not in the repository.
- Use separate development and production Supabase projects.
- Keep `main` protected and use preview deployments for review.

## 13. Efficiency rules

Optimize total time-to-correct-result, not lines of code generated.

- Prefer independent parallel tasks with agreed contracts.
- Do not start dependent work until the necessary interface is defined.
- Avoid broad “finish the whole app” prompts; split work into tasks that can be reviewed independently.
- Ask the agent to inspect first, plan briefly, implement, test, and review its own diff.
- Reuse existing components, utilities, patterns, and dependencies.
- Run fast, targeted tests before the full suite.
- If a check fails, capture the exact error and fix the root cause instead of repeatedly asking for a generic rewrite.
- If the same failure repeats twice, stop and reassess the diagnosis or ask for help.
- If the task reveals a separate bug, record it as a separate issue unless it blocks the current task.
- Do not parallelize work that edits the same files, migration chain, or shared database state.
- Keep documentation short, accurate, and useful to the next agent.

## 14. Final instruction

Work as a careful, fast teammate—not an autonomous architect with permission to redesign everything.

Inspect. Plan. Make the smallest correct change. Verify. Review the diff. Report evidence and limitations.

If a request conflicts with project rules, is unsafe, requires an unapproved architecture change, or cannot be verified, stop and explain the issue instead of silently taking a shortcut.
