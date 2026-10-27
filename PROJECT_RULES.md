You are working on the MIT-WPU NCC website.

Before starting:
1. Read PROJECT_RULES.md.
2. Read the relevant requirements and docs/api.md.
3. Inspect the existing implementation.
4. Identify dependencies and potential security implications.

TASK:
Implement the profile retrieval API.

FILES YOU MAY MODIFY:
- src/app/api/profile/route.ts
- Relevant backend tests

FILES YOU MUST NOT MODIFY:
- Frontend components
- Database migrations
- Authentication middleware
- Environment configuration

REQUIREMENTS:
- Authenticate the request using Supabase.
- Never trust a user ID supplied by the client to determine the current user.
- Return only fields the authenticated user is permitted to access.
- Handle unauthorized requests and database errors.
- Do not disable row-level security.
- Do not introduce new dependencies.

WORKFLOW:
1. Present a short implementation plan.
2. Wait for approval before implementing.
3. Implement only the requested task.
4. Run relevant tests and type checks.
5. Review the diff for security problems and unrelated changes.
6. Report modified files, test results, and unresolved issues.

DEFINITION OF DONE:
- The API works for an authenticated cadet.
- Unauthenticated requests are rejected.
- Tests cover the expected success and failure cases.
- No unrelated files are changed.