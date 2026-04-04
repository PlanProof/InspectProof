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

`/`, `/login`, `/dashboard`, `/projects`, `/projects/:id`, `/inspections`, `/inspections/:id`, `/issues`, `/activity`, `/share/:token`, `/analytics`, `/templates`, `/doc-templates`, `/inspectors`, `/settings`, `/settings/contractor-library`, `/billing`, `/admin`, `/terms`, `/privacy`

**Reports:** Accessed via the "Reports" tab inside each project's detail page (`/projects/:id`) — no standalone `/reports` route.

**Contractors:** Managed per-project via the "Contractors" tab inside `/projects/:id` — linked specifically to that project.

**Contractor Library:** Dedicated page at `/settings/contractor-library` — lists and manages all org-level contractors with search, trade category grouping, and performance history. Navigation card in Settings > Organisation tab.

**Public Share Portal:** `/share/:token` — public (no auth) client portal for sharing an inspection with clients. Generated via `POST /api/inspections/:id/share`.

## Recent Feature Additions

- **Project Contractors**: `project_contractors` table, full CRUD API at `/api/projects/:id/contractors`, "Contractors" tab in project detail with add/edit/delete + Send Defect Report email per inspection
- **Trade Allocated dropdown**: Inspection checklist items use a `<select>` populated from project contractors + internal staff (falls back to text input if none configured)
- **Internal Staff email + invite**: `email` column on `internal_staff` table, Send Invite button in Settings
- **Dashboard Defects + Upcoming stats**: Dashboard now shows 5 KPI cards: Active Projects, Inspections (Month), Reports Pending, Open Defects (links to /issues), Upcoming 7 Days
- **Issues page** (`/issues`): Full issues listing with stat bar (Open/Overdue/Resolved), close-out dialog with evidence photo upload, overdue reminder email button
- **Audit Trail** (`/activity`): Filterable audit log with entity type tabs and search. API: `GET /api/activity`
- **Client Portal** (`/share/:token`): Public token-based inspection portal (no auth). Generated via `POST /api/inspections/:id/share`
- **Digital Sign-off**: `POST /api/inspections/:id/sign-off` sets status=completed + signedOffAt. Sign Off + Share buttons in inspection detail header
- **Recurring Templates**: `recurrence_type` + `recurrence_interval` fields on `checklist_templates`. Edit form + display badge in templates page
- **Overdue Reminders**: `POST /api/issues/send-overdue-reminders` sends emails for all overdue open issues (admin/company-admin only)
- **Organisation settings → DB** (critical fix): Org fields (`abn`, `companyPhone`, `companyEmail`, `companyAddress`, `companySuburb`, `companyState`, `companyPostcode`, `companyWebsite`, `logoUrl`, `accreditationBody`, `accreditationNumber`) are now stored in the `users` table. API: `GET/PATCH /api/auth/organisation`. localStorage fallback for migration only.
- **Company Logo Upload**: Upload button in Organisation tab → presigned URL → object storage → `logoUrl` saved to DB. Preview shown inline.
- **Notification Preferences → DB**: `notificationPrefs` JSON column on `users` table. API: `GET/PATCH /api/auth/notification-prefs`. `inspectproof_notif_prefs` localStorage cleared on save.
- **Two-step onboarding**: `?onboarding=1` now shows Step 1 (Profile/Profession) → Step 2 (Organisation Details) with progress banner. "Save & Start Inspecting →" button and "Skip for now" link on Step 2.
- **Report Email Sending Fixed**: `POST /api/reports/:id/send` now generates a PDF buffer and sends it via Resend with the PDF as email attachment. `sendReportEmail()` added to `lib/email.ts`. Returns `email_failed` error if email delivery fails.
- **Org data in PDF footer**: PDF reports show company name, ABN, and address in the navy footer bar (instead of generic "InspectProof · Confidential"). Org data fetched from the inspector's user record at PDF generation time.
- **Address Autocomplete (Web)**: `AddressAutocomplete` component in `artifacts/web/src/components/` uses free Nominatim OpenStreetMap API (no API key required). Searches Australian addresses, parses house/street/suburb/state/postcode fields. Used in the New Project dialog. Falls back to manual entry mode with unverified warning banner.
- **Generate Report UX fix**: Removed the confusing "Generate" button from the `generate-report.tsx` header. Now shows a clear sticky footer CTA: grayed-out "Select a report type above" when no type selected, active "Generate Report" button once a type is selected.
- **Contractor Library page** (`/settings/contractor-library`): Dedicated page with full contractor management (add, edit, remove, performance history). Two-column layout: main contractor list with search/filter + sidebar with Trade Categories management. Settings > Organisation tab replaced embedded library with navigation card.
- **Trade Categories**: New `trade_categories` DB table (scoped per company). CRUD API at `/api/org-contractors/trade-categories`. Categories shown on contractor cards as violet badges. Contractors can be grouped by category on the library page.
- **Org Contractor Combobox**: Project Contractors tab replaces flat checklist with `OrgContractorCombobox` — assigned contractors shown as removable emerald chips, unassigned searchable via text input dropdown (filters by name/trade/company).

## Security Architecture

### API Route Auth Model
- **`requireAuth`**: Middleware that validates Bearer token and populates `req.authUser`. Returns 401 if missing/invalid.
- **`optionalAuth`**: Sets `req.authUser` if token present, but does not reject unauthenticated requests.
- **Org Isolation**: Every resource route (project, inspection, report detail/update/delete) now checks that the requester belongs to the same org as the resource creator. Isolation helper pattern: `canAccessProject(createdById, req.authUser)` checks direct ownership OR cross-team (team member with same adminUserId).
- **Upload routes**: Both `POST /api/storage/uploads/file` and `POST /api/storage/uploads/request-url` require auth. `GET /api/storage/objects/*` is public (needed for email image links).
- **Reports PDF**: `GET /api/reports/:id/pdf` is intentionally public to support `?_token=` email link access.

### Org Boundary
- Company admin (`isCompanyAdmin=true`): owns their org. `adminUserId` is null in DB.
- Team member: `adminUserId` in DB points to their company admin's `id`.
- Effective admin ID for access checks: `user.isCompanyAdmin ? user.id : parseInt(user.adminUserId)`.
- Cross-team access (colleague A sees colleague B's projects): resolved via one extra DB lookup of `creator.adminUserId`.

## Pre-Launch Audit Completed (A001–A011)

### Security Fixes Applied
- **A005**: All project, inspection, and report CRUD routes now enforce `requireAuth` + org isolation
- **A005**: Removed unauthenticated "Test Project" leak from `GET /api/projects`
- **A005**: `POST /storage/uploads/*` now requires auth
- **A005**: `getUserIdFromRequest(req) ?? 1` anti-pattern removed from main CRUD routes
- **A001**: Forgot-password flow built end-to-end (HMAC-signed stateless tokens, Resend email, web + mobile UI)
- **A007**: Mobile demo credentials removed, `expo-location` + `expo-notifications` added to app.json plugins
- **A003**: Email templates verified production-ready (Australian English, proper branding, no TODO text)
- **A002**: Stripe webhook handler verified (signature verification, `STRIPE_WEBHOOK_SECRET` required)

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
