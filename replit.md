# InspectProof — Australian Building Certification Platform

## Overview

InspectProof is a full-stack platform designed for Australian building certifiers and surveyors. It streamlines certification workflows through a comprehensive suite of tools. The platform features a desktop web application for office administration, a mobile application for field inspections, and a shared API server with PostgreSQL.

Key capabilities:
- **Project Management**: Projects, inspections, issues with full metadata and status filters
- **Inspection Tools**: Mobile photo markup with SVG annotation, digital checklists, NCC 2022 code references
- **Reporting & Analytics**: Inspection certificates, PDF reports, live dashboard stats
- **Template Library**: Full checklist templates for Building Surveyor (Class 1, 10, 2-9, Pool), Structural Engineer, Plumbing Officer, Builder/QC, Site Supervisor, WHS Officer, Pre-Purchase Inspector, Fire Safety Engineer
- **Team & Permissions**: Company-linked invite flow, granular permissions (`isCompanyAdmin`, `editTemplates`, `addInspectors`, `createProjects`), plan limits
- **Discipline Filtering**: Inspection Types automatically filtered to the logged-in user's assigned discipline

## User Preferences

Simple language and detailed explanations. Iterative development with clear communication. Do not make changes to files in the `lib/db` folder without explicit approval.

## System Architecture

pnpm workspace monorepo. Three deployable artifacts: `artifacts/web` (React + Vite SPA), `artifacts/api-server` (Express 5 + Node 24), `artifacts/mobile` (Expo React Native).

**Color Palette:** Primary `#0B1933`, Secondary `#466DB5`, Accent `#C5D92D`

**Logo rule:** `logo-dark.png` = dark/navy background; `logo-light.png` = light/white background

## Technical Implementation

- **Auth:** Token-based (JWT), `req.authUser` in middleware (NOT `req.user`)
- **Plan limits:** `free_trial`=1, `starter`=3, `professional`=10, `enterprise`=null
- **API startup order:** schema migrations → admin seed → listen on port 8080 → background (templates + Stripe + storage)
- **Photo Markup:** Mobile SVG free-hand annotations stored as JSON keyed by `objectPath`; dedup on both client and server side
- **Inspection Types filter:** `GET /api/projects/:id/inspection-types?discipline=...` — WHERE clause must precede GROUP BY in Drizzle query
- **Checklist Templates:** 71 global templates across all disciplines, seeded via `ensureGlobalTemplatesSeed()` on startup

## Routes (Web App)

`/`, `/login`, `/dashboard`, `/projects`, `/projects/:id`, `/inspections`, `/inspections/:id`, `/reports`, `/analytics`, `/templates`, `/doc-templates`, `/inspectors`, `/settings`, `/billing`, `/admin`, `/terms`, `/privacy`

**Reports:** Standalone `/reports` page lists all reports across all projects (grouped by project, searchable, filterable by status). Reports also accessible per-project via the "Reports" tab inside `/projects/:id`.

## Recent Feature Additions

- **Project Contractors**: `project_contractors` table, full CRUD API at `/api/projects/:id/contractors`, "Contractors" tab in project detail with add/edit/delete + Send Defect Report email per inspection
- **Trade Allocated dropdown**: Inspection checklist items use a `<select>` populated from project contractors + internal staff (falls back to text input if none configured)
- **Internal Staff email + invite**: `email` column on `internal_staff` table, Send Invite button in Settings
- **Standalone Reports page**: `/reports` route + "Reports" sidebar link — shows all reports grouped by project with search, status filter, PDF viewer, download, approve, delete

## External Dependencies

- **Database:** PostgreSQL via `SUPABASE_DATABASE_URL`
- **File Storage:** Replit Object Storage (bucket `replit-objstore-97d074d9-8576-42de-97b0-9bf4a2a327c8`) via `PRIVATE_OBJECT_DIR`; Supabase Storage optional fallback
- **Email:** Resend (`RESEND_API_KEY`) from `noreply@inspectproof.com.au`
- **Stripe:** Replit Stripe connector (development); `STRIPE_SECRET_KEY` in production
- **Expo Project ID:** `b93ea21e-4b89-4be9-9ca7-c37bd022f2aa`; `newArchEnabled: false` in `app.json`

## Deployment Configuration

### API Server (`artifacts/api-server/.replit-artifact/artifact.toml`)
- Production build: `pnpm --filter @workspace/api-server run build`
- Production run: `node --enable-source-maps artifacts/api-server/dist/index.mjs`
- Health check: `GET /api/healthz` → `{"status":"ok","db":"connected"}`
- PORT: 8080

### Web App (`artifacts/web/.replit-artifact/artifact.toml`)
- Production build: `pnpm --filter @workspace/web run build`
- Serve: static from `artifacts/web/dist/public`
- SPA rewrite: `/*` → `/index.html`

## Admin Credentials

- Email: `contact@inspectproof.com.au`
- Password: `InspectProof2024!`
- Profession: Building Surveyor
- Plan: enterprise (admin)
