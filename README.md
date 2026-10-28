# MIT World Peace University (MIT-WPU) - National Cadet Corps (NCC) Unit Portal

> **Motto:** *"Unity and Discipline"*  
> **Headquarters:** NCC Group Headquarters, Pune • Maharashtra Directorate  
> **Institution:** MIT World Peace University, Pune, India  

A full-stack, enterprise-grade web application and cadet administration platform built for the **MIT WPU NCC Unit**. Engineered with Next.js 16 (App Router), TypeScript, Tailwind CSS, Framer Motion, Prisma ORM, and NextAuth.

---

## 🎖 Features & Architecture

### 1. Public Experience
- **Hero & Command Vision**: Animated hero section displaying the official emblem, *"Unity and Discipline"* motto, and stats counters.
- **About Us (`/about`)**: History of the National Cadet Corps, core aims, university unit overview, and placeholder roster for ANO, Officers, and Senior Under Officers.
- **Events & Expeditions (`/events`)**:
  - **Trek to Korigad Fort (3 October 2026)**: Detailed overview of the Sahyadri range trek near Lonavala, objectives, full schedule timeline, key learnings, and photo gallery.
  - **Blood Donation Camp (9 October 2026)**: Community welfare mission, partner details, units collected, and photo gallery.
- **Photo Gallery (`/gallery`)**: Responsive, tabbed photo gallery (All / Korigad Trek / Blood Donation) featuring a smooth lightbox viewer.
- **Activities & Training (`/activities`)**: Drill, Weapon Training & Firing, Camps (CATC, TSC, RDC, EBSB), Adventure, Social Service, and Certification Exams (A, B, C) breakdown.
- **Cadet Study Material Catalog (`/study-materials`)**: Categorized repositories for Drill, Weapon Training, Map Reading, Leadership, and Examination Papers with search, category filtering, and authenticated download access.
- **Contact Us (`/contact`)**: Interactive inquiry form saved to database, campus address, parade timings, email, helpline, and embedded Google Maps view.

### 2. Cadet Portal & Self-Service (`/dashboard`)
- **Personal Dashboard**: View assigned regimental number, wing, year, branch, and medical data.
- **Attendance Percentage Tracker**: Real-time attendance meter with automatic warnings if parade attendance dips below the mandatory 75% threshold.
- **Training Roll History**: Detailed log of all attended parades, drills, and camps.
- **Unit Noticeboard**: Real-time broadcasts and urgent parade orders from unit officers.

### 3. Admin Command Center (`/admin`)
- **Overview Analytics**: Live metric cards for total enrolled cadets, pending applications, parade counts, and public messages.
- **Cadet Enrolment Roster**:
  - View all applicants with filters by Wing (Army / Navy / Air) and Status.
  - Single-click **Approve** and **Reject** controls.
  - **Export to Excel (.xlsx)**: Generates complete spreadsheets for Directorate submissions.
- **Attendance Management System**:
  - Create parade, drill, camp, or lecture sessions.
  - Interactive roll call with **Bulk Mark All Present** and granular Present / Absent / On Duty / Leave toggles.
  - Permanent audit history.
- **Study Material Management**: Add, categorize, and remove digital study notes and exam preparation documents.
- **Noticeboard Announcements**: Create priority announcements displayed on the home page and cadet dashboards.
- **Inquiry Management**: Read messages submitted via the public contact form.

---

## 🚀 Quick Start & Setup

### 1. Prerequisites
- Node.js 18.x or 20+ installed
- npm or pnpm

### 2. Installation
```bash
# Clone or navigate to the repository
cd ncc-website

# Install dependencies
npm ci
```

### 3. Database Setup (Local Development)

The datasource is **PostgreSQL** (`prisma/schema.prisma` uses `provider = "postgresql"`). Local development must point at a **separate development database** — never at production.

```bash
# Point DATABASE_URL at a local PostgreSQL database (see .env.example)
npx prisma migrate dev     # create/apply migrations for the local database
npx prisma generate         # generate Prisma Client

# Seed initial admin, sample cadet, events, and site data (development only)
npx -y tsx prisma/seed.ts
```

- `prisma migrate dev` is for local development only. It can reset the target database, so it must never be pointed at production.
- `prisma db push` is **not** part of the normal schema-management workflow and must never be run against production.
- The legacy SQLite files (`prisma/dev.db`, `backups/*.db`) are historical artifacts. The live database is PostgreSQL.

### 4. Running Locally
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---



---

## 🗄 Database Connection (Supabase)

- Use the **Supabase session pooler** endpoint (`*.pooler.supabase.com`, port `5432`) in `DATABASE_URL`. Do **not** use the direct database hostname (`db.<project-ref>.supabase.co`): Vercel's build and runtime hosts are IPv4-only and cannot reach the direct, IPv6-only database address.
- Use the session pooler (not the transaction pooler on port `6543`) so Prisma can use prepared statements, which migrations require.
- The connection string must include `?sslmode=require`.

Example shape (placeholders only — never commit a real connection string):

```env
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
```

---

## 🗄 Production Schema Management

Production schema changes are applied with **`prisma migrate deploy`** only:

```bash
# Applies committed files from prisma/migrations/. Never prompts, never resets, never drops data.
npx prisma migrate deploy
```

- Run it from a protected CI job that holds the production database secret, or manually from an operator machine whose `DATABASE_URL` has been verified as production.
- `migrate deploy` applies the committed SQL in `prisma/migrations/` and records it in `_prisma_migrations`. It does not create a database and does not invent schema.
- Never run `prisma migrate dev`, `prisma migrate reset`, `prisma db push`, or `prisma/seed.ts` against production.

### Backup and recovery precautions

1. **Back up before every production migration.** Create a Supabase restore point in the Dashboard (Database → Backups) and, for extra safety, take an on-demand dump:
   ```bash
   pg_dump --dbname="$DATABASE_URL" --format=custom --file="ncc-backup-$(date +%Y%m%d-%H%M%S).dump"
   ```
2. **Store dumps outside the repository.** They contain production data and must never be committed (the repository ignores `backups/`, `*.db`, and `.env*`).
3. **Verify after deploying**:
   ```bash
   npx prisma migrate status
   ```
   The output should list no pending migrations.
4. **To restore:** provision a fresh database, load the dump, then point `DATABASE_URL` at it:
   ```bash
   pg_restore --dbname="$DATABASE_URL" --clean --if-exists ncc-backup-<timestamp>.dump
   ```
5. Take a backup before any destructive or long-running migration, and rehearse the restore path on a scratch database first.

---

## ☁️ Deployment Guide (Vercel)

1. Push your repository to GitHub or GitLab.
2. In the [Vercel Dashboard](https://vercel.com), click **Add New Project** and import the repository.
3. Configure Environment Variables in Vercel Project Settings (Production and Preview):
   - `DATABASE_URL`: Production PostgreSQL connection string, using the Supabase **session pooler** endpoint (see *Database Connection*). Required at build time (Prisma Client construction) and at runtime.
   - `NEXTAUTH_SECRET` (or `AUTH_SECRET`): A secure 32+ character random string (generate with `openssl rand -base64 32`).
   - `NEXTAUTH_URL`: Your custom domain or Vercel deployment URL (e.g. `https://ncc-mitwpu.vercel.app`).
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google OAuth credentials for the existing sign-in provider.
   - `NEXT_PUBLIC_APP_URL`: Public base URL of the deployed site.
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: Supabase project credentials for study-material storage.
   - `ALLOWED_EMAIL_DOMAIN` (optional, defaults to `mitwpu.edu.in`) and `STUDY_MATERIAL_ALLOWED_HOSTS` (optional).
4. Click **Deploy**. Vercel runs `npm run build`; the `postinstall` script runs `prisma generate`. The build **does not** apply migrations.
5. **Migrations are a separate, protected step** run with `npx prisma migrate deploy` (see *Production Schema Management*). They are not part of the Vercel build and are not applied automatically until the protected migration job is set up.

---

## 📂 Project Directory Structure

```text
ncc-website/
├── prisma/
│   ├── schema.prisma        # Database schema (Cadets, Attendance, Events, Materials)
│   ├── migrations/          # Committed SQL migration history (apply with prisma migrate deploy)
│   └── seed.ts              # Database seeder script (development only)
├── public/
│   ├── images/
│   │   ├── logo/            # Unit & NCC emblems
│   │   ├── trek/            # Korigad Fort expedition gallery photos
│   │   └── blood-donation/  # Blood donation camp photos
├── src/
│   ├── app/
│   │   ├── about/           # About Us page
│   │   ├── activities/      # Activities & Training curriculum
│   │   ├── admin/           # Admin Command Center
│   │   ├── api/             # REST endpoints (auth, register, contact, admin)
│   │   ├── contact/         # Contact Us page
│   │   ├── dashboard/       # Cadet personal portal
│   │   ├── events/          # Events list & dynamic [slug] pages
│   │   ├── gallery/         # Tabbed Lightbox Gallery
│   │   ├── login/           # Authentication portal
│   │   ├── register/        # New cadet enrolment form
│   │   ├── study-materials/ # Study notes & syllabus repository
│   │   ├── globals.css      # Custom military theme styles & Tailwind tokens
│   │   ├── layout.tsx       # Root layout with Navbar and Footer
│   │   └── page.tsx         # Homepage with hero, stats, and event highlights
│   ├── components/          # Reusable UI components (Navbar, Footer, Lightbox, etc.)
│   ├── lib/                 # Prisma client, NextAuth configuration, image utilities
│   └── middleware.ts        # Role-based route guard
└── package.json
```

---

**Jai Hind! 🇮🇳**
