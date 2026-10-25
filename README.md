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
npm install
```

### 3. Database Initialization & Seeding
```bash
# Sync Prisma schema to local SQLite database
npx prisma db push

# Generate Prisma Client
npx prisma generate

# Seed initial admin, sample cadet, events, and site data
npx -y tsx prisma/seed.ts
```

### 4. Running Locally
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---



---

## 🗄 Switching from SQLite to PostgreSQL (Production)

To switch from SQLite to PostgreSQL (e.g. Supabase, Neon, AWS RDS, or Vercel Postgres):

1. Open `prisma/schema.prisma` and update the datasource:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Update your `.env` file with the PostgreSQL connection string:
   ```env
   DATABASE_URL="postgresql://user:password@host:5432/ncc_database?sslmode=require"
   ```
3. Run the migration:
   ```bash
   npx prisma db push
   npx -y tsx prisma/seed.ts
   ```

---

## ☁️ Deployment Guide (Vercel)

1. Push your repository to GitHub or GitLab.
2. In the [Vercel Dashboard](https://vercel.com), click **Add New Project** and import the repository.
3. Configure Environment Variables in Vercel Project Settings:
   - `DATABASE_URL`: Your production database connection string (e.g. Supabase or Neon PostgreSQL).
   - `AUTH_SECRET` / `NEXTAUTH_SECRET`: A secure 32+ character random string (generate with `openssl rand -base64 32`).
   - `NEXTAUTH_URL`: Your custom domain or Vercel deployment URL (e.g. `https://ncc-mitwpu.vercel.app`).
4. Click **Deploy**. Vercel will automatically build and deploy the Next.js App Router application.

---

## 📂 Project Directory Structure

```text
ncc-website/
├── prisma/
│   ├── schema.prisma        # Database schema (Cadets, Attendance, Events, Materials)
│   └── seed.ts              # Database seeder script
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
