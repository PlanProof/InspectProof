import { Link, Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  ClipboardList,
  ShieldCheck,
  FileText,
  Users,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  Building2,
  Wrench,
  Droplets,
  HardHat,
  ClipboardCheck,
  ShieldAlert,
  Home,
  Flame,
  BarChart3,
  MapPin,
  Calendar,
  Bell,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Who It's For", href: "#professionals" },
  { label: "How It Works", href: "#how-it-works" },
];

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 sm:px-6 pt-4">
      <div className="mx-auto max-w-6xl">
        <div className="relative flex h-14 items-center rounded-2xl bg-white px-5 shadow-lg shadow-black/8">
          {/* Logo */}
          <div className="flex flex-1 items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}logo-light.png`} alt="InspectProof" className="h-9 w-9 object-contain" />
            <span className="text-[22px] text-[#0B1933] leading-none" style={{ fontFamily: "'OddliniUX', sans-serif", fontWeight: 500, letterSpacing: "0.02em", lineHeight: 1 }}>
              InspectProof
            </span>
          </div>

          {/* Desktop nav — absolutely centred */}
          <nav className="absolute left-1/2 hidden -translate-x-1/2 md:flex items-center gap-7">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-gray-500 hover:text-[#0B1933] transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Sign In */}
          <div className="flex flex-1 justify-end items-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#466DB5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3a5c9a] transition-colors"
            >
              Sign In <ChevronRight className="h-3.5 w-3.5" />
            </Link>
            {/* Mobile menu button */}
            <button
              className="md:hidden p-1 text-gray-500 hover:text-[#0B1933]"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden mt-1 rounded-2xl bg-white shadow-lg shadow-black/8 px-5 py-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="block py-2.5 text-sm text-gray-500 hover:text-[#0B1933] border-b border-gray-100 last:border-0"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#0B1933]">
      {/* ── Two-column layout ─────────────────────────────────── */}
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[55%_45%] min-h-[88vh] items-center gap-0">

          {/* Left: text content */}
          <div className="py-36 lg:py-24 lg:pr-16 z-10 relative">
            <h1
              className="text-4xl sm:text-5xl font-normal leading-[1.1] mb-6"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              <span className="text-white block">Inspection records</span>
              <span className="text-[#C5D92D] block">that prove compliance.</span>
            </h1>

            <p className="text-lg text-white/55 mb-10 leading-relaxed max-w-xl">
              The field inspection platform for every professional working
              within Australia's built environment. Capture, document and
              report on every inspection — fast, accurate and audit-ready.
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-[#C5D92D] px-7 py-3.5 text-base font-semibold text-[#0B1933] hover:bg-[#d4e83a] transition-colors"
              >
                Get Started <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-7 py-3.5 text-base font-medium text-white hover:bg-white/10 transition-colors"
              >
                See How It Works
              </a>
            </div>

            {/* Stats — inline under CTAs */}
            <div className="mt-16 pt-8 border-t border-white/10 grid grid-cols-3 gap-0">
              {[
                { value: "100%", label: "NCC class\ncoverage" },
                { value: "< 2 min", label: "Average\nreport time" },
                { value: "Zero", label: "Paper checklists\nneeded" },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className={`${i > 0 ? "border-l border-white/10 pl-6" : ""} ${i < 2 ? "pr-6" : ""}`}
                >
                  <div
                    className="text-3xl font-normal text-[#C5D92D] leading-none"
                    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  >
                    {stat.value}
                  </div>
                  <div className="text-xs text-white/45 mt-2 whitespace-pre-line leading-relaxed">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: hero image */}
          <div className="hidden lg:block relative self-stretch">
            {/* Left gradient fade from navy into the image */}
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#0B1933] to-transparent z-10" />
            {/* Top gradient */}
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#0B1933] to-transparent z-10" />
            {/* Bottom gradient */}
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0B1933] to-transparent z-10" />
            <img
              src="/hero-construction.jpg"
              alt="Construction professional on site"
              className="absolute inset-0 w-full h-full object-cover object-center"
              style={{ filter: "brightness(0.75) contrast(1.05)" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: ClipboardList,
      title: "NCC-Aligned Checklists",
      description:
        "Pre-built checklists covering all 17 NCC building classes. Every item maps directly to the National Construction Code so nothing is missed.",
    },
    {
      icon: FileText,
      title: "Instant Inspection Reports",
      description:
        "Generate PDF inspection reports on the spot. Choose from NCB, certificate of inspection, plumbing compliance and more — auto-populated from field data.",
    },
    {
      icon: ShieldCheck,
      title: "Audit-Ready Evidence",
      description:
        "Every inspection is timestamped, geotagged and stored securely. Full audit trails with photo evidence, defect notes and sign-off history.",
    },
    {
      icon: MapPin,
      title: "Multi-Site Project Tracking",
      description:
        "Manage unlimited projects and sites. Track progress, pending inspections, and outstanding issues across every development in one dashboard.",
    },
    {
      icon: Calendar,
      title: "Scheduling & Run Sheets",
      description:
        "Assign inspections to certifiers and engineers. Daily run sheets sent automatically so your team always knows where to be.",
    },
    {
      icon: BarChart3,
      title: "Compliance Analytics",
      description:
        "Spot recurring non-compliance issues across your portfolio. Trend data helps you identify systemic risks before they become disputes.",
    },
    {
      icon: Bell,
      title: "Issue Tracking",
      description:
        "Log and track defects, RFIs and show-cause notices in real time. Link issues directly to inspection records and NCC provisions.",
    },
    {
      icon: Users,
      title: "Team Management",
      description:
        "Role-based access for principals, certifiers, engineers and support staff. Control who can create, sign off or export inspection records.",
    },
  ];

  return (
    <section id="features" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#0B1933]/20 bg-[#0B1933]/5 px-4 py-1.5 mb-4">
            <span className="text-xs font-medium text-[#0B1933] tracking-wide uppercase">
              Platform Features
            </span>
          </div>
          <h2
            className="text-3xl sm:text-4xl font-normal text-[#0B1933] mb-4"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Everything you need in the field
          </h2>
          <p className="mx-auto max-w-2xl text-gray-500">
            Built by industry professionals, for the professionals of Australia's
            built environment — not a generic tool adapted for the field.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-gray-100 bg-gray-50/50 p-6 hover:border-[#466DB5]/30 hover:bg-[#466DB5]/5 transition-all"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#0B1933]">
                <f.icon className="h-5 w-5 text-[#C5D92D]" />
              </div>
              <h3
                className="font-semibold text-[#0B1933] mb-2"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                {f.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PROFESSIONALS = [
  {
    icon: ShieldCheck,
    role: "Building Surveyors",
    description:
      "Manage the full statutory inspection lifecycle from a single platform. InspectProof gives building surveyors a professional system for issuing compliant inspection certificates, managing hold points and delivering client-ready reports — from minor works to complex Class 2–9 developments.",
    bullets: [
      "NCC and BCA-aligned inspection checklists",
      "Statutory hold point and mandatory inspection management",
      "Occupation and compliance certificate documentation",
      "Client-facing PDF report and certificate delivery",
    ],
  },
  {
    icon: Building2,
    role: "Structural Engineers",
    description:
      "Document structural inspections at every stage — from footing inspections to final frame. InspectProof ensures your sign-off is backed by complete, timestamped evidence that stands up to scrutiny.",
    bullets: [
      "Stage-by-stage structural inspection records",
      "Photo evidence attached to each inspection item",
      "Non-conformance and hold point management",
      "Engineer certification report export",
    ],
  },
  {
    icon: Droplets,
    role: "Plumbing Inspectors",
    description:
      "Carry out plumbing inspections with purpose-built checklists covering AS/NZS standards. Issue plumbing compliance certificates from the field, without the paperwork.",
    bullets: [
      "Plumbing compliance certificate templates",
      "AS/NZS and state regulation aligned checklists",
      "Pressure test and fixture inspection records",
      "Geocoded inspection reports for regulatory lodgement",
    ],
  },
  {
    icon: HardHat,
    role: "Builders",
    description:
      "Take control of quality on-site without the paperwork. InspectProof gives builders a structured way to record quality checks at every stage, flag non-conformances and maintain a complete audit trail before handover.",
    bullets: [
      "Stage-based quality control checklists",
      "Non-conformance flagging and resolution tracking",
      "Photo evidence linked to each inspection item",
      "Pre-handover inspection records for clients",
    ],
  },
  {
    icon: ClipboardCheck,
    role: "Site Supervisors",
    description:
      "Keep every trade and inspection on track from one place. Schedule inspections, log daily observations, manage hold points and ensure nothing slips through the cracks during construction.",
    bullets: [
      "Daily run sheet scheduling and management",
      "Hold point and inspection gate management",
      "Daily site diary and observation logging",
      "Real-time progress visibility across all trades",
    ],
  },
  {
    icon: ShieldAlert,
    role: "WHS Officers",
    description:
      "Document safety inspections and hazard assessments in the field with the same rigour as any compliance inspection. Raise issues instantly, track corrective actions and produce audit-ready WHS records.",
    bullets: [
      "Safety inspection checklists aligned to WHS Act",
      "Hazard and incident reporting with photo evidence",
      "Corrective action tracking and close-out",
      "Audit-ready safety records and reports",
    ],
  },
  {
    icon: Home,
    role: "Pre-Purchase Inspectors",
    description:
      "Deliver professional building inspection reports faster than ever. Use purpose-built checklists, capture photo evidence on-site and generate branded client reports before you leave the property.",
    bullets: [
      "Residential and commercial inspection templates",
      "Branded PDF report generation from the field",
      "Photo markup and annotation tools",
      "Client delivery direct from the app",
    ],
  },
  {
    icon: Flame,
    role: "Fire Safety Engineers",
    description:
      "Conduct fire safety inspections, document passive and active fire system compliance and issue fire safety certificates — all from a platform built for the rigour of Australian fire safety standards.",
    bullets: [
      "Fire safety system inspection checklists",
      "Passive and active fire protection verification",
      "Annual fire safety statement support",
      "Non-conformance and rectification tracking",
    ],
  },
];

function Professionals() {
  const [active, setActive] = useState(0);
  const p = PROFESSIONALS[active];

  return (
    <section id="professionals" className="bg-[#0B1933] py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C5D92D]/30 bg-[#C5D92D]/10 px-4 py-1.5 mb-4">
            <span className="text-xs font-medium text-[#C5D92D] tracking-wide uppercase">
              Who It's For
            </span>
          </div>
          <h2
            className="text-3xl sm:text-4xl font-normal text-white mb-4"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Built for every professional<br />working within Australia's built environment
          </h2>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {PROFESSIONALS.map((prof, i) => (
            <button
              key={prof.role}
              onClick={() => setActive(i)}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                active === i
                  ? "bg-[#C5D92D] text-[#0B1933]"
                  : "border border-white/20 text-white/60 hover:text-white hover:border-white/40"
              }`}
            >
              <prof.icon className="h-4 w-4" />
              {prof.role}
            </button>
          ))}
        </div>

        {/* Content panel */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 md:p-12 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#C5D92D]/15 border border-[#C5D92D]/30">
              <p.icon className="h-6 w-6 text-[#C5D92D]" />
            </div>
            <h3
              className="text-2xl font-normal text-white mb-4"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              {p.role}
            </h3>
            <p className="text-white/60 leading-relaxed mb-8">{p.description}</p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-md bg-[#C5D92D] px-6 py-3 text-sm font-semibold text-[#0B1933] hover:bg-[#d4e83a] transition-colors"
            >
              Get Started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="flex flex-col items-center justify-center">
            <ul className="space-y-4">
              {p.bullets.map((b) => (
                <li key={b} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#C5D92D]" />
                  <span className="text-white/70 text-sm leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Set up your project",
      description:
        "Create a project for each site or engagement. Add the address, project type, and assign your inspection team. All sites are organised and searchable.",
    },
    {
      number: "02",
      title: "Conduct the inspection",
      description:
        "On site, open the relevant checklist on your phone or tablet. Mark items pass, fail or N/A. Add photos, notes and defect details in seconds.",
    },
    {
      number: "03",
      title: "Generate the report",
      description:
        "Choose your report type — certificate of inspection, engineering sign-off, plumbing compliance or custom. The system populates it from your field data.",
    },
    {
      number: "04",
      title: "Deliver and archive",
      description:
        "Share the PDF report instantly with your client, council or owner-builder. Every record is securely stored and retrievable for audit at any time.",
    },
  ];

  return (
    <section id="how-it-works" className="bg-gray-50 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#0B1933]/20 bg-[#0B1933]/5 px-4 py-1.5 mb-4">
            <span className="text-xs font-medium text-[#0B1933] tracking-wide uppercase">
              How It Works
            </span>
          </div>
          <h2
            className="text-3xl sm:text-4xl font-normal text-[#0B1933] mb-4"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            From site to report in four steps
          </h2>
          <p className="mx-auto max-w-2xl text-gray-500">
            InspectProof removes the paperwork from building inspections without
            removing the rigour. Every step is designed for compliance professionals.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step) => (
            <div key={step.number} className="relative">
              <div className="relative z-10">
                <div className="mb-4 text-4xl font-normal text-[#0B1933]/10" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {step.number}
                </div>
                <div className="mb-3 h-0.5 w-12 bg-[#C5D92D]" />
                <h3
                  className="font-semibold text-[#0B1933] mb-2"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  {step.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <div className="rounded-2xl bg-[#0B1933] px-8 py-16 relative overflow-hidden">
          {/* Background accent */}
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#466DB5]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#C5D92D]/10 blur-3xl" />

          <div className="relative">
            <h2
              className="text-3xl sm:text-4xl font-normal text-white mb-4"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Ready to streamline your inspections?
            </h2>
            <p className="text-white/60 mb-10 max-w-xl mx-auto">
              Trusted by professionals working within Australia's built environment
              for defensible, audit-ready inspection records — from the field, every time.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-md bg-[#C5D92D] px-8 py-3.5 text-base font-semibold text-[#0B1933] hover:bg-[#d4e83a] transition-colors shadow-lg shadow-[#C5D92D]/20"
              >
                Sign In to InspectProof <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#0B1933] border-t border-white/10 pt-14 pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Top row */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10 mb-12">

          {/* Brand + pitch */}
          <div className="max-w-sm">
            <div className="flex items-center gap-2 mb-4">
              <img src={`${import.meta.env.BASE_URL}logo-dark.png`} alt="InspectProof" className="h-8 w-8 object-contain" />
              <span className="text-base text-[#F2F3F4]" style={{ fontFamily: "'OddliniUX', sans-serif", fontWeight: 500, letterSpacing: "0.02em" }}>
                InspectProof
              </span>
            </div>
            <p className="text-sm text-white/50 leading-relaxed">
              The field inspection platform for professionals working within
              Australia's built environment. Fast, accurate and audit-ready.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col sm:flex-row gap-10">
            <div>
              <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">Platform</p>
              <ul className="space-y-2.5">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="text-sm text-white/50 hover:text-white transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
                <li>
                  <Link to="/login" className="text-sm text-white/50 hover:text-white transition-colors">
                    Sign In
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">Contact</p>
              <ul className="space-y-2.5">
                <li>
                  <a href="mailto:contact@inspectproof.com.au" className="text-sm text-white/50 hover:text-white transition-colors">
                    contact@inspectproof.com.au
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">Legal</p>
              <ul className="space-y-2.5">
                <li>
                  <a href="/terms" className="text-sm text-white/50 hover:text-white transition-colors">
                    Terms &amp; Conditions
                  </a>
                </li>
                <li>
                  <a href="/privacy" className="text-sm text-white/50 hover:text-white transition-colors">
                    Privacy Policy
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} InspectProof. All rights reserved.
          </p>
          <p className="text-xs text-white/20">
            InspectProof &mdash; a product of PlanProof Technologies Pty Ltd
          </p>
        </div>

      </div>
    </footer>
  );
}

export default function Landing() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="min-h-screen">
      <Header />
      <Hero />
      <Features />
      <Professionals />
      <HowItWorks />
      <CTA />
      <Footer />
    </div>
  );
}
