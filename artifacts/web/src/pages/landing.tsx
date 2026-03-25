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
        <div className="flex h-14 items-center justify-between rounded-2xl bg-white px-5 shadow-lg shadow-black/8">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0B1933]">
              <ClipboardList className="h-4 w-4 text-[#C5D92D]" />
            </div>
            <span className="text-[18px] font-semibold text-[#0B1933]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              InspectProof
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
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
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B1933] px-4 py-2 text-sm font-medium text-white hover:bg-[#152540] transition-colors"
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
    <section className="relative overflow-hidden bg-[#0B1933] pt-32 pb-24">
      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[600px] w-[600px] rounded-full bg-[#466DB5]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        <h1
          className="text-4xl sm:text-5xl lg:text-6xl font-normal text-white leading-tight mb-6"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Inspection records that
          <br />
          <span className="text-[#C5D92D]">prove compliance.</span>
        </h1>

        <p className="mx-auto max-w-2xl text-lg text-white/60 mb-10 leading-relaxed">
          InspectProof is the field inspection platform for building certifiers,
          structural engineers and plumbing inspectors. Capture, document and
          report on every inspection — fast, accurate and audit-ready.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-md bg-[#C5D92D] px-7 py-3 text-base font-semibold text-[#0B1933] hover:bg-[#d4e83a] transition-colors shadow-lg shadow-[#C5D92D]/20"
          >
            Get Started <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-7 py-3 text-base font-medium text-white hover:bg-white/10 transition-colors"
          >
            See How It Works
          </a>
        </div>

        {/* Stats strip */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { value: "100%", label: "NCC class coverage" },
            { value: "< 2 min", label: "Average report time" },
            { value: "17", label: "NCC building classes" },
            { value: "Zero", label: "Paper checklists needed" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-5">
              <div
                className="text-2xl font-normal text-[#C5D92D] mb-1"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                {stat.value}
              </div>
              <div className="text-xs text-white/50">{stat.label}</div>
            </div>
          ))}
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
            Built from the ground up for Australian building professionals who
            need reliable, defensible records — not just another generic app.
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
    icon: Wrench,
    role: "Private Certifiers & Surveyors",
    description:
      "Handle the full volume of a private practice. InspectProof scales with your workload, giving you a professional system for every job — from minor works to complex developments.",
    bullets: [
      "Unlimited projects and inspection records",
      "Multi-inspector team with role-based access",
      "Daily run sheet scheduling and dispatch",
      "Client-facing PDF report delivery",
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
            Supporting the professionals<br />who approve and certify Australia's buildings
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
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 md:p-12 grid md:grid-cols-2 gap-10 items-start">
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
          <ul className="space-y-4">
            {p.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#C5D92D] mt-0.5" />
                <span className="text-white/70 text-sm leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
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
        "Create a project for each development. Add the address, NCC building class, and assign your inspection team. All sites are stored and searchable.",
    },
    {
      number: "02",
      title: "Conduct the inspection",
      description:
        "On site, open the NCC-aligned checklist on your phone or tablet. Mark items pass, fail or N/A. Add photos, notes and defect details in seconds.",
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
            From site to certificate in four steps
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
              Join building certifiers, engineers and plumbing inspectors across
              Australia who trust InspectProof for defensible, audit-ready records.
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
    <footer className="bg-[#0B1933] border-t border-white/10 py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#C5D92D]">
              <ClipboardList className="h-4 w-4 text-[#0B1933]" />
            </div>
            <span className="text-sm font-semibold text-white" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              InspectProof
            </span>
          </div>
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} InspectProof. Built for Australian building professionals.
          </p>
          <Link to="/login" className="text-xs text-white/50 hover:text-white transition-colors">
            Sign In →
          </Link>
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
