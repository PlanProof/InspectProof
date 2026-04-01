# InspectProof — Australian Building Certification Platform

## Overview

InspectProof is a full-stack platform designed for Australian building certifiers and surveyors. It aims to streamline certification workflows through a comprehensive suite of tools. The platform features a desktop web application for office administration, a mobile application for field inspections, and a shared API server with a PostgreSQL database.

Key capabilities include:
- **Comprehensive Project Management**: Tracking projects, inspections, and issues with detailed metadata and status filters.
- **Advanced Inspection Tools**: Mobile photo markup, digital checklists with templating capabilities, and detailed issue tracking with NCC code references.
- **Reporting & Analytics**: Generation of inspection certificates and various reports, along with dashboards for live stats and performance insights.
- **Robust Compliance**: Integration of NCC 2022 standards and various AS standards for comprehensive compliance checks.

The business vision is to become the leading digital platform for building certification in Australia, enhancing efficiency, accuracy, and compliance for certifiers nationwide.

## User Preferences

I prefer simple language and detailed explanations. I want iterative development with clear communication at each stage. Please ask before making major changes. I prefer functional programming paradigms where applicable. Do not make changes to files in the `lib/db` folder without explicit approval.

## System Architecture

The InspectProof platform is built as a pnpm workspace monorepo, separating concerns into distinct applications and shared libraries.

**UI/UX Decisions:**
- **Color Palette:** Primary: `#0B1933` (Maastricht Blue), Secondary: `#466DB5` (BlueYonder), Accent: `#C5D92D` (Pear).
- **Desktop Web App (React + Vite):** Serves as the primary administrative interface, offering features like project management, checklist template editing, analytics, and report generation.
- **Mobile App (Expo):** Designed for field inspectors, focusing on mobile-first workflows such as photo markup, checklist completion, and issue logging.

**Technical Implementations & Feature Specifications:**
- **Authentication:** Token-based authentication with persistent storage.
- **Photo Markup:** Mobile inspectors can annotate photos using free-hand SVG drawings, with markup stored as JSON.
- **Checklist Template Editor:** An inline editor allows for full management of checklist items, including adding/editing/deleting items, section headers, reasons, code references, risk levels, and required toggles.
- **Permission System:** Granular company-level permissions (`isCompanyAdmin`, `userType`, `permissions` JSON column for `editTemplates`, `addInspectors`, `createProjects`) differentiate user roles and access within the platform. Self-registrations create company admins.
- **Global Template Library:** Automatically seeded checklist and report templates on server startup for various disciplines (Building Surveyor, Structural Engineer, Plumbing Officer, etc.).
- **API Server (Express 5):** Provides a shared backend, handling all data operations and business logic, with PostgreSQL and Drizzle ORM for data persistence.
- **Database Schema:** Defined using Drizzle ORM, with `drizzle-zod` for insert schemas.
- **API Codegen:** Utilizes Orval to generate OpenAPI spec-derived React Query hooks and Zod schemas for validation.
- **Monorepo Structure:** `artifacts` for deployable applications (api-server), `lib` for shared libraries (api-spec, api-client-react, api-zod, db), and `scripts` for utilities.
- **TypeScript & Composite Projects:** All packages leverage TypeScript with composite projects for efficient type checking across the monorepo.

**System Design Choices:**
- **Node.js 24 + pnpm:** Modern JavaScript runtime and efficient package manager for monorepo.
- **PostgreSQL + Drizzle ORM:** Robust relational database with a type-safe ORM for data management.
- **Express 5:** Fast and flexible web application framework for the API.
- **Zod:** Schema validation library used across the API for robust data integrity.

## External Dependencies

-   **Database:** Supabase PostgreSQL (`SUPABASE_DATABASE_URL`) - utilized for robust and scalable data storage.
-   **File Storage:**
    -   Replit Object Storage (using `PRIVATE_OBJECT_DIR` env var and GCS bucket `replit-objstore-97d074d9-8576-42de-97b0-9bf4a2a327c8`) is the primary storage.
    -   Supabase Storage is an optional alternative if `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are configured.
-   **Email:** Office365 SMTP via nodemailer (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) for sending platform-generated emails.
-   **Stripe:** Integrated for payment processing, using Replit Stripe connector in development and `STRIPE_SECRET_KEY` in production.