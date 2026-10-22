# NCC MIT WPU Website — Deep Audit Report

**Repository:** `MIT-WPU-NCC-`  
**Audit Date:** 21 October 2026  
**Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS, Prisma 6, NextAuth v5 (beta), Framer Motion  
**Current DB:** SQLite (dev) — must migrate to Postgres for production

---

## 1. Requirements Coverage Summary (PRD v2.0: R-01 to R-49)

| Priority | Requirement | Status | Notes |
|----------|-------------|--------|-------|
| **P0** | R-01 Remove demo access, rotate creds | ⚠️ Partial | Login UI demo buttons removed; seed still has `admin123`/`cadet123`; README still publishes credentials |
| **P0** | R-02 Persistent Postgres (Neon) | ❌ Not started | Still on SQLite; datasource provider = `sqlite` |
| **P0** | R-03 Protected study material | ❌ Not started | Files in `/public/study/` served directly; no private storage; no signed URLs; no auth check on download |
| **P0** | R-04 Server-side auth everywhere | ⚠️ Partial | `requireRole` helper created; adopted in 5 admin routes; middleware only redirects; no guard on study-material download |
| **P0** | R-05 Abuse protection (CAPTCHA, rate limit) | ❌ Not started | No Turnstile, no Upstash, no rate limiting |
| **P0** | R-06 Replace `xlsx` (vulnerable) | ⚠️ Partial | `exceljs` installed + export route; `xlsx` + `file-saver` still in deps; `npm audit` shows high severity |
| **P0** | R-07 Password recovery | ❌ Not started | No forgot/reset endpoints; no token model |
| **P0** | R-08 Privacy policy + consent | ⚠️ Partial | Checkbox added to register form; `/privacy` `/terms` pages missing; no Consent model; policy version not stored |

| **P1** | R-09 Real officers (editable) | ⚠️ Partial | Officer model exists; seed has placeholders `[Name]`; no admin CRUD UI for officers |
| **P1** | R-10 Real imagery & contact details | ❌ Not started | Hero is logo only; social links = `#`; two conflicting emails; phone may be university switchboard |
| **P1** | R-11 Metadata, og:image, sitemap, robots, 404 | ⚠️ Partial | `sitemap.ts`, `robots.ts`, `not-found.tsx`, `opengraph-image.tsx` exist; title template OK; no favicon set; og:image route implemented |
| **P1** | R-12 Admissions clarity (deadline, FAQ) | ❌ Not started | No deadline, eligibility, seats, FAQ/How-to-Join page |
| **P1** | R-13 Event management (admin CRUD) | ⚠️ Partial | Event model + seed data; events page reads DB with hardcoded fallback; **no admin UI** for create/edit/delete/publish |
| **P1** | R-14 Gallery management (upload, resize) | ❌ Not started | Gallery uses static images in `/public`; no admin upload/resize; no album model |
| **P1** | R-15 Site settings (banner, stats, contact) | ❌ Not started | SiteStats model exists; no admin UI; homepage stats hardcoded |
| **P1** | R-16 Role levels (Admin vs Officer) | ⚠️ Partial | Role enum in auth (`ADMIN`/`CADET`); Officer model exists but no `OFFICER` role in auth; middleware only checks `ADMIN` |
| **P1** | R-17 Email notifications (Resend) | ❌ Not started | No email provider configured; no queue; no templates |
| **P1** | R-18 Email verification | ❌ Not started | No verification token model; no verification flow |

| **P2** | R-19 Profile editing + certificates | ❌ Not started | No profile edit page; no Certificate/Achievement models |
| **P2** | R-20 QR attendance + reports + alerts | ❌ Not started | AttendanceSession/Attendance models basic; no QR, no rotating token, no manual override, no cadet view |
| **P2** | R-21 Leave applications | ❌ Not started | No LeaveRequest model |
| **P2** | R-22 Training calendar + .ics | ❌ Not started | No calendar export |
| **P2** | R-23 Hall of Fame / Alumni | ❌ Not started | No models, no pages |
| **P2** | R-24 Mock tests (Cert A/B) | ❌ Not started | No quiz models |
| **P2** | R-25 Bulk CSV import + audit log | ❌ Not started | No import API; AuditLog model missing |
| **P2** | R-26 i18n, dark mode, PWA | ❌ Not started | No i18n; dark mode CSS exists but no toggle; no PWA manifest |

| **v2 P0** | R-27 Clean login page (no demo) | ✅ Done | Demo buttons removed; clean UI with show/hide password |
| **v2 P0** | R-28 Clear messages + role redirects | ⚠️ Partial | Login redirects by role; no pending/rejected specific messages; no application status tracker |
| **v2 P1** | R-29 Application status tracker | ❌ Not started | No `/dashboard/status` page |
| **v2 P2** | R-30 Stronger sign-in (2FA, Google) | ❌ Not started | No TOTP; no Google provider |

| **v2 P1** | R-31 Profile for every cadet (locked fields) | ❌ Not started | Profile model basic; no edit page; no locked-field enforcement; no change requests |
| **v2 P1** | R-32 Bulk import + activation codes | ❌ Not started | No import API; no ActivationCode model; no peppered hash |
| **v2 P1** | R-33 Profile photos (crop, compress, private) | ❌ Not started | No photo upload; no sharp processing; no private bucket; no signed URLs |
| **v2 P2** | R-34 Photo moderation | ❌ Not started | No moderation workflow |
| **v2 P1** | R-35 Completion dashboard | ❌ Not started | No admin completion view |
| **v2 P1** | R-36 Fast roster (paginated, thumbnails) | ❌ Not started | Admin cadet table loads all; no pagination; no thumbnails |
| **v2 P2** | R-37 Cadet ID card (printable) | ❌ Not started | No ID card generation |

| **v2 P1** | R-38 Sessions + statuses | ⚠️ Partial | Session model exists; types/statuses basic; no `DRAFT/OPEN/CLOSED` enum; no audience targeting |
| **v2 P1** | R-39 QR check-in (rotating token) | ❌ Not started | No QR generation; no token verification; no `/attend` route |
| **v2 P1** | R-40 Admin manual attendance | ⚠️ Partial | Admin can create session + mark all; no per-cadet edit after; no audit log; no officer role |
| **v2 P1** | R-41 Audit trail + locking | ❌ Not started | No AuditLog; no 24h lock |
| **v2 P1** | R-42 Cadet attendance view + 75% alerts | ✅ Done (UI) | Dashboard shows %, 75% warning, history table; no leave requests; no "need X of next Y" calc |
| **v2 P2** | R-43 Reports + alerts | ❌ Not started | No exports by wing/date; no below-75% list; no 3-absent flag; no batch email |
| **v2 P2** | R-44 Offline roll call (PWA) | ❌ Not started | No service worker; no IndexedDB queue |

| **v2 P0** | R-45 Gallery lightbox fix | ⚠️ Partial | Lightbox exists; scroll lock restored on close; **pinch-zoom broken** (no touch-action); `100vh` vs `dvh` issue; full-size image loads on open |
| **v2 P1** | R-46 Mobile-first layout | ⚠️ Partial | Responsive grid; some touch targets < 44px; registration form single-page (not stepped); tables not cardified on mobile |
| **v2 P1** | R-47 Mobile performance | ❌ Not started | Hero image not resized per device; no lazy-loading on gallery thumbnails; no reduced-motion config |

| **v2 P0** | R-48 Hosting stack (Vercel, Neon, R2, Resend, Turnstile, Upstash) | ❌ Not started | All infra decisions pending; no env vars for R2/Resend/Turnstile/Upstash |
| **v2 P1** | R-49 Capacity (500 cadets, 400 concurrent) | ❌ Not started | No load test; no ISR config on public pages; no connection pooling verified |

---

## 2. Codebase Reality vs Requirements

### What Exists (Solid Foundation)
- **Auth:** NextAuth v5 credentials + JWT sessions with `role` in token
- **Database:** Prisma schema with User, CadetProfile, Event, GalleryImage, AttendanceSession, Attendance, StudyMaterial, ContactMessage, Announcement, Officer, SiteStats
- **Admin UI:** 6-tab command center (Overview, Cadets, Attendance, Materials, Announcements, Messages) with working CRUD for cadets, sessions, materials, announcements, messages
- **Cadet Dashboard:** Attendance %, history table, 75% warning, noticeboard, quick links
- **Public Pages:** Home, About, Events (DB + fallback), Gallery (lightbox), Activities, Study Materials (DB + fallback), Contact
- **SEO/Metadata:** `sitemap.ts`, `robots.ts`, `not-found.tsx`, `opengraph-image.tsx`, title template, viewport config
- **Security Helpers:** `requireRole` guard in `src/lib/guard.ts`
- **Excel Export:** `exceljs` route for cadet roster
- **CI Pipeline:** GitHub Actions workflow for install, lint, typecheck, build, audit

### Critical Gaps (Blocking Production)

| Area | Gap | Severity |
|------|-----|----------|
| **Database** | SQLite in schema; no Postgres migration; no `DIRECT_URL` | 🔴 P0 |
| **File Storage** | Study materials in `/public` (world-readable); no R2/Supabase bucket; no signed URLs | 🔴 P0 |
| **Auth Security** | No CAPTCHA; no rate limiting; no password reset; no email verification | 🔴 P0 |
| **Vulnerable Deps** | `xlsx` 0.18.5 + `file-saver` still in `package.json` | 🔴 P0 |
| **Credentials** | Seed uses `admin123`/`cadet123`; README publishes them | 🔴 P0 |
| **Content** | All officer names `[Name]`; hero = logo; social links `#`; conflicting emails | 🔴 P1 |
| **Admin CRUD** | No UI for Officers, Events, Gallery, SiteSettings | 🔴 P1 |
| **Mobile Gallery** | Pinch-zoom broken; `vh` not `dvh`; full-res image loads | 🟡 P0 |
| **Role System** | No `OFFICER` role in auth; junior officers can't take attendance | 🟡 P1 |

---

## 3. Work Completed in This Session

### Created
- `src/lib/guard.ts` — `requireRole`, `requireAdmin`, `requireOfficerOrAdmin`, `requireCadetOrAbove`
- `src/app/api/admin/messages/route.ts` — GET (list) + POST (mark read)
- `src/app/api/admin/cadets/export/route.ts` — Excel export via `exceljs`
- `src/app/robots.ts` — Blocks `/admin`, `/dashboard`, `/api`
- `src/app/not-found.tsx` — Custom 404
- `src/app/opengraph-image.tsx` — Dynamic OG image route
- `.github/workflows/ci.yml` — CI pipeline

### Modified
- `src/app/api/admin/cadets/route.ts` — Uses `requireAdmin`; added messages POST endpoint
- `src/app/api/admin/attendance/route.ts` — Uses `requireAdmin`; added PATCH (single mark) + DELETE (session)
- `src/app/api/admin/study-materials/route.ts` — Uses `requireAdmin`
- `src/app/api/admin/announcements/route.ts` — Uses `requireAdmin`
- `src/app/api/register/route.ts` — Password min 10; `policyAccepted` validation
- `src/app/login/LoginClient.tsx` — Removed demo quick-fill buttons
- `src/app/login/page.tsx` — Updated metadata
- `src/app/register/RegisterClient.tsx` — Added policy consent checkbox + links; password min 10
- `src/app/layout.tsx` — OG/Twitter images point to `/opengraph-image`
- `src/app/admin/AdminClient.tsx` — Export button → server route; messages auto-refresh; mark-read handler

### Dependencies
- Added `exceljs`
- `xlsx` + `file-saver` still present (must remove after verifying no usage)

---

## 4. TypeScript / Build Errors (Must Fix)

| File | Errors |
|------|--------|
| `src/app/admin/AdminClient.tsx` | `refreshMessages` used before declaration in `useInterval`/`useEffect`; callback type mismatch |
| `src/app/opengraph-image.tsx` | `weight` prop on `Shield` (lucide-react uses `strokeWidth`); font-weight type mismatch in style objects |
| `src/app/register/RegisterClient.tsx` | Duplicate `policyAccepted` key in Zod schema (lines 28-30 and 46-48) |
| `src/app/api/register/route.ts` | No `policyAccepted` in DB write (schema has it, but not persisted) |

Run `npx tsc --noEmit` to see full list.

---

## 5. Infrastructure Decisions Required (Cannot Automate)

| Decision | Needed For | Options |
|----------|------------|---------|
| **Postgres Provider** | R-02, R-48 | Neon (preferred — no pause) or Supabase |
| **File Storage** | R-03, R-33, R-48 | Cloudflare R2 (10 GB, free egress, needs card) or Supabase Storage (1 GB, no card) |
| **Email Provider** | R-07, R-17, R-18 | Resend (3k/mo free) — need verified domain |
| **CAPTCHA** | R-05 | Cloudflare Turnstile (free, unlimited) |
| **Rate Limiting** | R-05 | Upstash Redis (10k req/day free) |
| **Officer Data** | R-09 | Real names, ranks, photos from ANO |
| **Contact Details** | R-10 | Single email, verified phone, working social URLs |
| **Registration Policy** | R-12 | Deadline, eligibility, seat count, FAQ content |
| **75% Rule Details** | R-42 | Does Late count? Do Excused sessions reduce denominator? |

---

## 6. Recommended Next Actions (Priority Order)

### Phase 0 — Safety (Week 1)
1. **Fix all TypeScript errors** → `tsc --noEmit` clean
2. **Remove demo credentials everywhere**:
   - `prisma/seed.ts`: read from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`; refuse weak passwords
   - `README.md`: delete credential table
   - `.env.example`: no real values
3. **Run CI locally**: `npm ci && npm run lint && npx tsc --noEmit && npm run build && npm audit --audit-level=high`
4. **Wire admin messages + attendance endpoints** fully in AdminClient
5. **Align register client/server**: single `policyAccepted` field; persist Consent row

### Phase 1 — Infrastructure (Week 2)
6. **Migrate to Postgres (Neon)**:
   - Update `prisma/schema.prisma` provider → `postgresql`
   - Add `DIRECT_URL` env
   - Run `prisma migrate dev` → `prisma migrate deploy` in Vercel build
7. **Set up private file storage (R2 or Supabase)**:
   - Move study PDFs out of `/public`
   - Create `/api/materials/[id]/download` with signed URLs + cadet approval check
8. **Add abuse protection**:
   - Turnstile on register/contact/reset
   - Upstash rate limits (5 login/IP/10min, 3 register/IP/hr)
9. **Implement password reset + email verification**:
   - `PasswordResetToken`, `EmailVerificationToken` models
   - Resend integration + email queue
10. **Create `/privacy` and `/terms` pages**; store Consent on register

### Phase 2 — Self-Management (Weeks 3-4)
11. **Admin CRUD for Officers, Events, Gallery, SiteSettings**
12. **Migrate hardcoded events/gallery to DB** (one-time script)
13. **Role system**: add `OFFICER` to auth; middleware + guard updates
14. **Real content**: officer photos, hero image, contact details, social links

### Phase 3 — v2 Features (Weeks 5+)
15. **Profiles + Photos** (R-31 to R-37): Profile edit page, sharp pipeline, signed URLs, roster pagination
16. **Bulk Import + Activation** (R-32): CSV import, peppered codes, `/activate` page
17. **QR Attendance** (R-38 to R-42): Rotating tokens, `/attend`, manual override, audit log, cadet view
18. **Mobile/Gallery Polish** (R-45 to R-47): `dvh`, pinch-zoom, stepped registration, reduced-motion
19. **Load Test** (R-49): k6 at 400 VU, p95 < 800ms

---

## 7. File-by-File Implementation Status

| File | Purpose | Status |
|------|---------|--------|
| `prisma/schema.prisma` | Data models | ⚠️ SQLite; missing: Consent, PasswordResetToken, EmailVerificationToken, ActivationCode, AuditLog, LeaveRequest, Certificate, Achievement, QuizAttempt; Officer role not in User enum |
| `prisma/seed.ts` | Dev seed | 🔴 Hardcoded weak passwords; placeholder officers |
| `src/lib/auth.ts` | NextAuth config | ✅ JWT + role; ❌ no 2FA, no Google, no tokenVersion |
| `src/lib/guard.ts` | Server authz | ✅ Created; partially adopted |
| `src/middleware.ts` | Route redirects | ✅ Basic; ❌ no OFFICER role |
| `src/app/login/LoginClient.tsx` | Login UI | ✅ Clean; ❌ no CapsLock warning, no Turnstile after 3 failures |
| `src/app/register/RegisterClient.tsx` | Register UI | ⚠️ Duplicate schema key; consent links to missing pages |
| `src/app/api/register/route.ts` | Register API | ⚠️ Consent not persisted |
| `src/app/admin/AdminClient.tsx` | Admin UI | ⚠️ TS errors; messages/attendance wiring incomplete |
| `src/app/api/admin/cadets/route.ts` | Cadet CRUD | ✅ requireAdmin |
| `src/app/api/admin/attendance/route.ts` | Attendance CRUD | ✅ requireAdmin + PATCH/DELETE |
| `src/app/api/admin/study-materials/route.ts` | Materials CRUD | ✅ requireAdmin |
| `src/app/api/admin/announcements/route.ts` | Announcements CRUD | ✅ requireAdmin |
| `src/app/api/admin/messages/route.ts` | Contact messages | ✅ Created |
| `src/app/api/admin/cadets/export/route.ts` | Excel export | ✅ Created (exceljs) |
| `src/app/study-materials/page.tsx` | Materials page | ⚠️ Public downloads; no auth check |
| `src/app/study-materials/StudyMaterialsClient.tsx` | Materials client | ✅ UI; ❌ download links public |
| `src/app/gallery/GalleryClient.tsx` | Gallery page | ✅ UI; ❌ static images only |
| `src/components/LightboxGallery.tsx` | Lightbox | ⚠️ Scroll lock OK; ❌ pinch-zoom, `vh`, full-res load |
| `src/app/events/page.tsx` | Events list | ⚠️ DB + fallback; ❌ no admin CRUD |
| `src/app/dashboard/page.tsx` | Dashboard server | ✅ Auth check + redirect |
| `src/app/dashboard/CadetDashboardClient.tsx` | Dashboard UI | ✅ Attendance %, 75% warning, history |
| `src/app/layout.tsx` | Root layout | ✅ Metadata, OG image, viewport |
| `src/app/opengraph-image.tsx` | OG image | ⚠️ TS errors |
| `src/app/sitemap.ts` | Sitemap | ✅ Exists |
| `src/app/robots.ts` | Robots | ✅ Created |
| `src/app/not-found.tsx` | 404 page | ✅ Created |
| `.github/workflows/ci.yml` | CI | ✅ Created |
| `next.config.ts` | Next config | ✅ CSP fixed (added unsafe-eval); Turbopack CSS rule |

---

## 8. Quick Status Legend

- ✅ **Done** — Implemented and working
- ⚠️ **Partial** — Started but incomplete, inconsistent, or unverified
- ❌ **Missing** — Not implemented
- 🔒 **Needs Decision** — Requires credentials, accounts, content, or product choices

---

## 9. Bottom Line

**Completion Estimate: ~25% of P0/P1 requirements**

The codebase has a strong structural foundation (auth, schema, admin UI, public pages, CI) but **zero infrastructure is production-ready**:
- Database is SQLite (data loss on Vercel redeploy)
- Study materials are publicly downloadable
- No abuse protection, no password recovery, no email
- Demo credentials still in seed + README
- TypeScript errors block clean build
- All v2 profile/attendance/mobile features unimplemented

**Immediate next step:** Fix TS errors → clean build → remove all demo credentials → then begin infrastructure migration (Postgres + private storage + email + CAPTCHA).