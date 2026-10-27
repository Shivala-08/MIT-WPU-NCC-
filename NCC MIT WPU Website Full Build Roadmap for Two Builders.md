# NCC MIT WPU Website: Full Build Roadmap for Two Builders

*Version 1.0 · 25 October 2026 · Plan for taking the site from public pages to a complete cadet portal, built by two people using AI coding tools*

## 1. Purpose and fixed decisions

This roadmap covers everything we discussed, not only the first 4-hour version. It replaces the NextAuth and Prisma assumptions in the earlier PRD and TRD (v2) with the simpler stack below. The earlier documents still hold useful requirement detail (R-01 to R-49), and a v3 rewrite should follow launch.

**Stack (fixed; do not let the AI change it):**

- Next.js (App Router), TypeScript and Tailwind, hosted on Vercel Hobby.
- Supabase for sign-in (Google only, college email only), Postgres with row-level security, and private file storage.
- `sharp` for photos, `exceljs` for Excel exports, Cloudflare Turnstile for CAPTCHA, Upstash for rate limiting, Resend for email later.
- Everything on free tiers. Limits were checked in October 2026 and must be rechecked before launch.

**Access model:** a new college Google account is `pending` until an admin approves it. Roles are `cadet`, `officer` (attendance and notices) and `admin` (everything). If the cadet’s email is on the imported roster, they are approved automatically on first sign-in. This roster import replaces the activation codes in TRD v2, which are not needed with Google sign-in.

## 2. Who does what

**Person A: Platform and data.** Database, security, sign-in, APIs, storage, CI, backups. A keeps the site safe.

**Person B: Experience and content.** Pages, UI, forms, mobile layout, gallery, SEO, admin screens, phone testing. B makes the site usable.

**Folder ownership**

- **A owns:** `supabase/migrations`, `src/lib/supabase`, `src/lib/guard.ts`, `middleware.ts`, `src/app/api/**`, `.github/workflows`, `.env.example`.
- **B owns:** `src/components`, the UI of every page under `src/app`, styles, public assets and written content.
- **Shared:** `src/types/db.ts` (generated from Supabase) and `docs/`.

**Handoff rules**

1. Only A writes database migrations. B asks for schema changes with a GitHub issue.
2. Before B builds a screen, A writes the API shape (route, input, output) in `docs/api.md`. B uses mock data until the real route is merged.
3. Neither person edits the other’s folders without saying so first.
4. Both people are owners of every account (GitHub, Vercel, Supabase, Google Cloud), created under a unit email, not a personal one.

## 3. Working agreement for vibe-coding

- **One task, one branch, one pull request.** Name branches like `feat/a4-profile-api`. Keep each PR small enough to review in 10 minutes.
- **The other person reviews every PR** on the Vercel preview link and runs the task’s ‘Done when’ check. Merge only when it passes.
- **One task per prompt.** Paste the exact task text and the files it may touch, and add ‘change nothing else’.
- **Ask for a short plan first,** then the code. Read the plan before accepting changes.
- **Commit after every working step** so a bad AI change can be undone.
- **Never paste real secrets into prompts.** Keys live in `.env.local` and Vercel settings only.
- **Use a separate dev Supabase project** for building and testing. Production data is never used for experiments.
- **Two 20-minute syncs a week** and a short Friday demo of what merged.
- **Definition of done:** works at 360 px wide, works logged out and logged in as each role, no console errors, no secrets in the diff, and the other person has tested it.

Put this file in the repo root as `PROJECT_RULES.md` and tell the AI tool to read it before every task:

```text
PROJECT RULES (read before every task)
- Stack: Next.js App Router, TypeScript, Tailwind, Supabase (Auth, Postgres, Storage), Vercel. Do not add or swap libraries without asking.
- Auth is Google sign-in only, college emails only. Never build password login.
- Never expose SUPABASE_SERVICE_ROLE_KEY to the browser or in NEXT_PUBLIC_ variables.
- Server code gets the user from supabase.auth.getUser(), never from request bodies.
- Every admin or officer route must check the caller's role on the server.
- Row-level security stays on for every table. Do not disable it to fix an error.
- Only change the files named in the task. Do not refactor unrelated code.
- Mobile first: test at 360px. Tap targets 44px, inputs 16px.
- Photos are private: signed URLs only, random file names.
- Ask before adding dependencies.
```

## 4. Timeline at a glance

Estimates assume AI-assisted coding and about 10 hours a week each. If either of you is new to Next.js, double them.

- **Day 1: Phase 0, setup** (about 2 hours each, together).
- **Week 1: Phase 1, safe login and foundation** (the MVP). A about 7 hours, B about 10.
- **Week 2: Phase 2, profiles, photos and roster.** A about 9 hours, B about 10.
- **Weeks 3 to 4: Phase 3, attendance.** A about 11 hours, B about 14.
- **Weeks 4 to 5: Phase 4, content management.** A about 14 hours, B about 16.
- **Weeks 6 to 7: Phase 5, hardening and launch.** A about 12 hours, B about 13, plus about 3 hours each of testing with real users.
- **Week 8 onward: Phase 6, extras** in the order the unit values them (about 20 hours each for the whole list).

Totals to launch: A about 58 hours, B about 68 hours.

## 5. Phase 0: Setup (Day 1)

- **Z1 \[A + B, 1h\] Shared accounts.** Create the GitHub repo or organization, Vercel project, two Supabase projects (dev and prod; check the free-plan project limit) and the Google Cloud project, all owned by both of you under a unit email. *Done when:* both can sign in to each and deploy a preview.
- **Z2 \[A, 1h\] Repo cleanup.** Remove the credential lines from the README, delete unused dependencies after checking nothing imports them (`next-auth`, `prisma`, `bcryptjs`, `xlsx`), add `.env.example` and `PROJECT_RULES.md`, protect the `main` branch and turn on Vercel previews. *Done when:* the build passes and no secret appears in the repo.
- **Z3 \[A, 1h\] Google sign-in setup.** Configure the OAuth consent screen (External, published), create the client, enable the Google provider in Supabase and set the redirect URLs. First, test a real student email from an incognito window to confirm the college accounts are Google accounts and note the exact domain. *Done when:* a test sign-in returns to the site.
- **Z4 \[B, 1h\] Layout audit and design tokens.** Open every public page at 320, 360 and 390 px, list what is broken (gallery, hero image, tables) as GitHub issues, and agree on colours, fonts and spacing in one place. *Done when:* the issue list exists and tokens are in the Tailwind config.

## 6. Phase 1: Safe login and foundation (Week 1, the MVP)

- **A1 \[A, 2h\] Database, row-level security and domain rule.** Create `profiles` with role and status, the new-user trigger, an `is_staff()` helper, column-level update grants so cadets cannot change role or status, and a trigger that rejects sign-ups outside the college domain (with a small `allowed_emails` table for exceptions). *Done when:* a second account cannot read other profiles or change its own role.
- **A2 \[A, 3h\] Sign-in flow.** `/auth/callback`, middleware that refreshes the session, a server guard (`requireRole`) using `getUser()`, role-aware redirects, domain check with a clear error. *Done when:* a college account signs in, a Gmail account is blocked, and pending users land on `/pending`.
- **A3 \[A, 2h\] Admin approval API.** Approve and reject routes that verify the caller is an approved admin or officer before using the service role. *Done when:* a cadet calling the route gets 403.
- **B1 \[B, 2h\] Login, pending and account UI.** One ‘Sign in with Google’ button, a clear ‘use your college email’ message, a pending page with the application status, the navbar user menu and logout. Remove the demo buttons. *Done when:* no demo credentials appear anywhere and the pages work at 360 px.
- **B2 \[B, 3h\] Gallery lightbox fix and mobile pass on public pages.** Replace the modal so the image fits the screen, scrolling is restored on close, and Escape, the close button and a tap outside all work. Fix the issues from Z4. *Done when:* it works on a real Android phone and an iPhone.
- **B3 \[B, 3h\] Admin shell and cadet list UI.** Admin layout and a paginated table (50 per page) with search, status filter and Approve and Reject buttons wired to A3. *Done when:* an admin approves a test account end to end.
- **B4 \[B, 2h\] Replace placeholders.** Real officer names and photos, a real hero photo, working social links, one consistent contact email and a verified phone number, and remove the developer note on the About page. This needs content from the unit, so ask for it on day 1. *Done when:* no ‘\[Name\]’ or `#` links remain.

**Milestone M1: safe login works.** Google sign-in for college emails only, admin approval, nothing public that should be private. Deploy to production here.

## 7. Phase 2: Profiles, photos and roster (Week 2)

- **A4 \[A, 2h\] Profile API and audit log.** Cadets update only phone, address, emergency contact, blood group, bio and photo; name, DOB, PRN, wing, rank, status and certificates are admin-only. Add an `audit_log` table and a profile-correction request table. *Done when:* a request that tries to change a locked field is rejected by the server.
- **A5 \[A, 3h\] Photo pipeline.** Server route that checks the real file type, limits size to 5 MB, resizes with `sharp` to 512 px plus a 96 px thumbnail as WebP, strips EXIF, stores both in a private bucket under random names, deletes the old files and returns signed links that expire in 10 minutes. *Done when:* a file renamed from .txt to .jpg is rejected and a logged-out request for a photo fails.
- **A6 \[A, 3h\] Roster import.** Admin uploads a CSV of up to 500 rows (name, college email, PRN, wing, year). The server validates every row, supports a dry run that reports errors by line number, and saves a `roster` table. On first sign-in, a matching email is approved automatically and the profile is pre-filled. *Done when:* a 500-row file imports and an unlisted account stays pending.
- **A7 \[A, 1h\] Consent record.** Store the policy version and time each user accepts it.
- **B5 \[B, 4h\] Profile page.** View and edit form, locked fields shown read-only, a ‘Request correction’ button, photo picker with square crop and browser-side compression, initials avatar when there is no photo, and a completion meter. *Done when:* a cadet can complete a profile on a phone in under 3 minutes.
- **B6 \[B, 4h\] Admin roster screens.** Import screen with the dry-run error list, roster table with thumbnails (50 per page, search, wing and year filters), a completion dashboard (not activated, missing photo, pending photo) and photo moderation (approve, reject with reason, replace or remove). *Done when:* an admin can find every cadet with a missing photo.
- **B7 \[B, 2h\] Privacy policy and consent screen.** Policy page, a first-login consent checkbox, retention and contact details. The unit and the university must supply the retention period. *Done when:* a new user cannot continue without accepting.

**Milestone M2: every cadet has a profile with a photo.** Invite the first cadets in waves of 50 to find problems early.

## 8. Phase 3: Attendance (Weeks 3 to 4)

- **A8 \[A, 3h\] Sessions and manual marking.** Session types and statuses (present, absent, late, excused, on duty), a unique record per cadet per session, staff-only writes with `method`, `marked_by` and `marked_at`, a required note for changes after close, officers locked out 24 hours after close, and audit log entries. *Done when:* a cadet cannot create or edit any record through any route.
- **A9 \[A, 4h\] QR check-in.** A per-session secret that never leaves the server, a token signed with a 30-second step (current and previous step accepted), a scan route that checks login, approved status, open session, valid token and no duplicate, a 6-digit manual code fallback, and a live summary route. Rate limit scans. *Done when:* a code older than about 60 seconds is rejected and a double scan creates one record.
- **A10 \[A, 2h\] Attendance numbers.** One query for each cadet’s percentage, the 75% eligibility helper and a list of cadets below 75%. Decide first how Late and Excused count (see section 14).
- **A11 \[A, 2h\] Leave requests API.** Request, approve and reject, with approved leave becoming Excused.
- **B8 \[B, 4h\] Admin session screens.** Create and open sessions and a mobile-first roll call: search, filters, ‘mark all present, then untick absentees’, large tap targets and a visible save state. *Done when:* an officer can mark 150 cadets on a phone in a few minutes.
- **B9 \[B, 3h\] QR display screen.** A large, projector-friendly QR that refreshes on a timer, the manual code, a live count and the list of cadets still missing. *Done when:* it stays readable from the back of a classroom.
- **B10 \[B, 4h\] Cadet scan and attendance pages.** The `/attend` landing page with success, ‘already marked’, ‘session closed’ and error states, plus a cadet attendance page with a percentage ring, a 75% line, a calendar and history.
- **B11 \[B, 3h\] Leave request screens** for cadets and admins.

**Milestone M3: run a real parade with QR attendance,** with a manual backup list on paper for the first two sessions. A rotating QR reduces proxy attendance but cannot remove it, so officers keep a visual check.

## 9. Phase 4: Content management (Weeks 4 to 5)

- **A12 \[A, 4h\] Content tables and APIs.** `events`, `gallery_images`, `officers`, `site_settings` and `notices`, a public bucket for gallery and event images, staff-only writes and public reads of published rows.
- **A13 \[A, 3h\] Study materials.** Private bucket, staff upload route (PDF, DOCX and PPTX only, 10 MB limit, validated type), and an authenticated download route that checks approved status and returns a link valid for 60 seconds. Nothing is stored in `/public`. *Done when:* the direct file URL fails when logged out.
- **A14 \[A, 5h\] Admin screens for officers, site settings and notices.** Edit banner, stats, contact details, social links, registration open or closed, officer list and announcements.
- **A15 \[A, 2h\] Contact form backend.** Turnstile check, rate limit, storage in an inbox table.
- **B12 \[B, 4h\] Public pages from the database.** Events with an Upcoming section, gallery, officers and stats, using cached rendering that refreshes when an admin saves a change.
- **B13 \[B, 5h\] Admin screens for events and gallery.** Create, edit, publish and delete events, multi-photo upload with browser-side resizing and albums.
- **B14 \[B, 3h\] Study material screens.** Searchable list by category, upload for staff, download for approved cadets.
- **B15 \[B, 2h\] Contact form and admin inbox UI.**
- **B16 \[B, 2h\] How to Join and FAQ pages.** Eligibility, selection process, Certificate A, B and C benefits, registration deadline.

**Milestone M4: officers run the site themselves.** B and A hold a 30-minute handover where an officer adds an event and a notice without help.

## 10. Phase 5: Hardening and launch (Weeks 6 to 7)

- **A16 \[A, 3h\] Security review.** Test every API route as anonymous, cadet, officer and admin; confirm row-level security on every table; search the built JavaScript for the service role key; run `npm audit`; remove any leftover test accounts.
- **A17 \[A, 2h\] Abuse limits and headers.** Rate limits on scans, uploads, contact and imports; security headers and a Content-Security-Policy that allows Turnstile and the map embed.
- **A18 \[A, 2h\] CI and error tracking.** GitHub Actions for lint, type check, build and audit on every PR; Sentry free plan.
- **A19 \[A, 2h\] Backups and keep-alive.** A weekly scheduled database dump, and a small daily request so the Supabase free project does not pause after a week of inactivity.
- **A20 \[A, 3h\] Load test.** k6 against a preview deployment with a test database: 400 virtual users on public pages, 100 on login and dashboard, 150 scans over 30 seconds. Pass: p95 under 800 ms and errors under 1%.
- **B17 \[B, 3h\] SEO.** Per-page titles and descriptions, a fixed title template, a share image, sitemap, robots, favicon and a custom 404.
- **B18 \[B, 3h\] Accessibility and speed.** Lighthouse mobile on every key page, colour contrast, labels, focus order, image sizes, reduced motion.
- **B19 \[B, 3h\] Device matrix.** Widths 320, 360, 375, 390, 412, 768 and 1024 px; Chrome on Android, Safari on iOS and Samsung Internet; Slow 4G throttling.
- **B20 \[B, 4h\] End-to-end tests.** Playwright: sign-in redirect rules, profile edit permissions, photo upload rejection, QR scan and replay rejection, and gallery open, scroll and close on phone profiles.
- **A + B \[3h each\] User testing.** Five cadets and two officers use a staging copy while you watch. Fix what confuses them.

**Milestone M5: launch.** Complete the launch checklist in section 12, announce in the unit group, and invite the full roster in waves.

## 11. Phase 6: Extras (Week 8 onward, in the unit’s priority order)

- **Certificates and achievements tracker** (A tables and routes, B screens): A, B and C status, camps such as CATC, TSC and RDC, ranks, awards.
- **Reports and alerts** (A, then B): Excel exports by cadet, wing and date; a daily check that flags cadets under 75% or absent three sessions in a row; in-app notices first.
- **Email notifications** (A): Resend with a verified sender, a queue that stays under the free daily cap, and templates for approval and new notices.
- **Training calendar with `.ics` export** (B, with A for the data).
- **Hall of Fame and alumni pages** (B, with A for a small table).
- **Cadet ID card** (B): a printable card with photo, name, regimental number and QR.
- **Mock tests for Certificate A and B** (A question bank and attempts, B quiz screens).
- **Offline roll call** (B, with A for sync): installable app that stores marks locally and syncs later.
- **Hindi and Marathi toggle, dark mode** (B).
- **Custom domain:** ask MIT WPU IT for an `ncc.` subdomain.

## 12. Launch checklist

- No credentials in the repo, README or built JavaScript, and no demo buttons.
- Only college emails can sign in; a personal Gmail is blocked with a clear message.
- A second test account cannot open `/admin`, change its own role or read other cadets’ data.
- Logged-out requests for photos and study files fail.
- Every `/api/admin/*` route returns 401 or 403 for anonymous and cadet users.
- Gallery opens, scrolls and closes on a real Android phone and an iPhone.
- A QR scan works once, a second scan says ‘Already marked’, and a manual change is recorded with who made it.
- Privacy policy and consent are live, and photo retention is stated.
- A database dump has been taken and restored once as a test.
- Load test and Lighthouse targets are met.
- At least two people own every account.

## 13. Running it after launch

- **Weekly:** check the Sentry and Vercel dashboards and confirm the backup ran.
- **Monthly:** review free-tier usage on Vercel, Supabase and storage; act at 70% of any limit.
- **Quarterly:** recheck free-tier terms, run `npm audit`, update dependencies on a branch.
- **Yearly intake cycle:** import the new roster, archive or remove graduating cadets’ data according to the retention rule, rotate admin roles to the new officers and update the handover note.
- **Keep:** a `docs/OPERATIONS.md` with account owners, how to restore a backup, and who to call.

## 14. Risks and cut lines

- **Behind schedule:** protect Phases 1 to 3. Cut in this order: Phase 6, then B16 and B14 (FAQ and study material screens), then leave requests (A11, B11), then the officers, settings and notices admin screens (A14), then the manual QR code fallback.
- **QR does not work well at a parade:** manual roll call is already built, so the unit is never blocked.
- **Student emails are not Google accounts:** test this on Day 1 (Z3). If they are Microsoft accounts, switch the provider before writing any other code.
- **Free tier pause or limit:** the daily ping and monthly usage review above; photos stay small and the database holds no files.
- **Merge conflicts and AI drift:** folder ownership, small PRs, `PROJECT_RULES.md`, and reviewing every diff.
- **One person unavailable:** both own every account and write short handover notes after each milestone.
- **Photo privacy:** private bucket, random names, signed links and a stated retention rule.

## 15. Decisions needed from the unit (before the phase that needs them)

- The real college email domain, and whether every cadet has a Google account on it (Day 1).
- Officer names, ranks and photos, a real hero photo, the unit’s email and phone (Phase 1).
- Is 500 cadets a hard maximum, and who issues regimental numbers (Phase 2).
- Photo retention period and who approves photos (Phase 2).
- Do Late marks count as present, and do Excused sessions leave the 75% calculation (Phase 3).
- Which actions junior officers (SUO and JUO) may take beyond attendance and notices (Phase 3).
- Whether the unit will accept a payment method on file for Cloudflare R2, or stay on Supabase Storage (Phase 4).
- Whether the university will give an `ncc.` subdomain (Phase 5).
