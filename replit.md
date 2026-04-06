# InspectProof — Australian Building Certification Platform

## Overview
InspectProof is a full-stack platform for Australian building certifiers and surveyors, designed to streamline certification workflows. It includes a desktop web application for administration, a mobile application for field inspections, and a shared API server with PostgreSQL. The platform aims to enhance efficiency in project management, inspections, reporting, and team collaboration within the Australian building certification industry.

Key capabilities include:
- **Project Management**: Comprehensive tools for managing projects, inspections, and issues with detailed metadata and status filtering.
- **Inspection Tools**: Mobile-first features such as SVG photo markup, digital checklists, and integrated NCC 2022 code references.
- **Reporting & Analytics**: Generation of inspection certificates, PDF reports, and real-time dashboard statistics.
- **Template Library**: A wide range of checklist templates for various disciplines (e.g., Building Surveyor, Structural Engineer, Plumbing Officer) and roles (71 global templates seeded on startup).
- **Team & Permissions**: Company-linked user management with granular permissions (isCompanyAdmin, editTemplates, etc.) and plan-based limits.
- **Discipline Filtering**: Automated filtering of inspection types based on the logged-in user's assigned discipline using Drizzle queries.

## User Preferences
Simple language and detailed explanations. Iterative development with clear communication. Do not make changes to files in the `lib/db` folder without explicit approval.

## System Architecture
The project is structured as a pnpm workspace monorepo, comprising three deployable artifacts: a React + Vite Single Page Application for the web (`artifacts/web`), an Express 5 + Node 24 API server (`artifacts/api-server`), and an Expo React Native mobile application (`artifacts/mobile`).

The project is structured as a pnpm workspace monorepo, comprising three deployable artifacts: a React + Vite Single Page Application for the web (`artifacts/web`), an Express 5 + Node 24 API server (`artifacts/api-server`), and an Expo React Native mobile application (`artifacts/mobile`).

**UI/UX Decisions:**
- **Color Palette:** Primary `#0B1933`, Secondary `#466DB5`, Accent `#C5D92D`.
- **Logo Rule:** `logo-dark.png` for dark backgrounds, `logo-light.png` for light backgrounds.
- **Web App Routes:** Key routes include `/`, `/login`, `/dashboard`, `/projects`, `/inspections`, `/calendar`, `/issues`, `/activity`, `/share/:token`, `/analytics`, `/templates`, `/doc-templates`, `/inspectors`, `/settings`, `/billing`, `/admin`, `/terms`, `/privacy`.
- **Specific UI/UX Components:**
    - Reports are accessed via the "Reports" tab within project detail pages (not a standalone route).
    - Contractors are managed per-project and globally via a dedicated "Contractor Library" page under organization settings.
    - Public share portal (`/share/:token`) for client access to inspection details.
    - Two-step onboarding process for new users (profile setup and organization details).
    - Address Autocomplete using Nominatim OpenStreetMap API in the web app.
    - Inspection Calendar view powered by `react-big-calendar` with various views, color-coding, and filtering.

**Technical Implementations:**
- **Authentication:** Token-based (JWT) with `req.authUser` for middleware.
- **Authorization:** Granular permissions (`isCompanyAdmin`, `editTemplates`, `addInspectors`, `createProjects`) and plan limits are enforced (e.g., `free_trial`=1, `starter`=3, `professional`=10, `enterprise`=null).
- **API Server Startup:** Follows a specific order: schema migrations, admin seed, listen on port, then background tasks (templates, Stripe, storage).
- **Photo Markup:** Mobile SVG free-hand annotations stored as JSON.
- **Data Filtering:** Inspection types are filtered by discipline using WHERE clause before GROUP BY in Drizzle queries.
- **Security:**
    - API routes enforce authentication (`requireAuth`) and organization isolation checks (`canAccessProject`).
    - Upload routes require authentication, while `GET /api/storage/objects/*` is public.
    - `GET /api/reports/:id/pdf` is public to support email link access.
    - Robust forgot-password flow with HMAC-signed stateless tokens.
- **Email System:** Utilizes Resend for transactional emails, logging all sent emails to an `email_logs` table. Supports retry functionality for certain email types via an admin UI. An internal cron endpoint (`/api/internal/send-inspection-reminders`) sends inspection reminders.
- **Calendar Integration:** Supports per-user OAuth calendar sync with Google and Outlook, integrating inspection events into external calendars.
- **Database Schema:** Defined using Drizzle, with additional SQL migrations for specific requirements (e.g., `email_verified_at`).

## External Dependencies

- **Database:** PostgreSQL (via `SUPABASE_DATABASE_URL`).
- **File Storage:** Replit Object Storage (primary, `PRIVATE_OBJECT_DIR`) or Supabase Storage (fallback).
- **Email Service:** Resend (`RESEND_API_KEY`) for all transactional emails.
- **Payment Gateway:** Stripe (Replit Stripe connector for development, `STRIPE_SECRET_KEY` for production).
- **Mobile Development:** Expo (`newArchEnabled: false`, Project ID: `b93ea21e-4b89-4be9-9ca7-c37bd022f2aa`).
- **Address Autocomplete:** Nominatim OpenStreetMap API.
- **Calendar Integration:** Google Calendar API and Microsoft Outlook Calendar API via OAuth.
