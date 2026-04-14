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
  Key,
  Waves,
  FileSearch,
  BarChart3,
  MapPin,
  Calendar,
  Bell,
  Menu,
  X,
  Zap,
  Send,
  AlertTriangle,
  CheckCheck,
  Clock,
  Loader2,
  Check,
} from "lucide-react";
import { useState } from "react";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Who It's For", href: "#professionals" },
  { label: "How It Works", href: "#how-it-works" },
];

/* ── Waitlist modal ─────────────────────────────────────── */
const DISCIPLINES = [
  "Building Surveyor",
  "Structural Engineer",
  "Plumbing Inspector",
  "Builder / QC",
  "Site Supervisor",
  "WHS Officer",
  "Pre-Purchase Inspector",
  "Fire Safety Engineer",
  "Property Manager",
  "Pool Inspector",
  "Insurance Assessor",
  "Other",
];

function WaitlistModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profession, setProfession] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, profession }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("success");
      } else {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(11,25,51,0.75)", backdropFilter: "blur(4px)" }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl p-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {status === "success" ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <Check className="h-7 w-7 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-[#0B1933] mb-2">You're on the list!</h3>
            <p className="text-sm text-gray-500 mb-6">
              Thanks for your interest. We'll be in touch when InspectProof is ready for new sign-ups.
            </p>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0B1933] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#162444] transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h3
                className="text-2xl font-bold text-[#0B1933] mb-1"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Join the waitlist
              </h3>
              <p className="text-sm text-gray-500">
                New sign-ups are currently by invitation. Enter your details and we'll reach out when we open up for new users.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {status === "error" && errorMsg && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {errorMsg}
                </div>
              )}
              <div>
                <label htmlFor="wl-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Full name
                </label>
                <input
                  id="wl-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="Jane Smith"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#466DB5] focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="wl-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Work email <span className="text-red-500">*</span>
                </label>
                <input
                  id="wl-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@company.com.au"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#466DB5] focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="wl-profession" className="block text-sm font-medium text-gray-700 mb-1">
                  Profession
                </label>
                <select
                  id="wl-profession"
                  value={profession}
                  onChange={e => setProfession(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#466DB5] focus:border-transparent"
                >
                  <option value="">Select your discipline…</option>
                  {DISCIPLINES.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#0B1933] px-6 py-3 text-sm font-semibold text-white hover:bg-[#162444] transition-colors disabled:opacity-60"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    Request early access <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
              <p className="text-xs text-gray-400 text-center">
                We won't share your details. Existing users can{" "}
                <Link to="/login" className="underline hover:text-gray-600">sign in here</Link>.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);

  return (
    <>
      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}
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
              <button
                onClick={() => setShowWaitlist(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#466DB5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3a5c9a] transition-colors"
              >
                Get Early Access <ChevronRight className="h-3.5 w-3.5" />
              </button>
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
    </>
  );
}

function Hero() {
  const [showWaitlist, setShowWaitlist] = useState(false);

  return (
    <>
      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}
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
                <button
                  onClick={() => setShowWaitlist(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#C5D92D] px-7 py-3.5 text-base font-semibold text-[#0B1933] hover:bg-[#d4e83a] transition-colors"
                >
                  Request Early Access <ArrowRight className="h-4 w-4" />
                </button>
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
                  { value: "Zero", label: "Missed hold points\nwith smart scheduling" },
                  { value: "< 2 min", label: "From inspection to\nsigned certificate" },
                  { value: "100%", label: "Audit-ready documentation,\nevery time" },
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
                src="/hero-construction-tablet.png"
                alt="Construction professional reviewing inspection on a tablet"
                className="absolute inset-0 w-full h-full object-cover object-center"
                style={{ filter: "brightness(0.75) contrast(1.05)" }}
              />
            </div>
          </div>
        </div>
      </section>
    </>
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

function DefectSection() {
  const points = [
    {
      icon: Zap,
      title: "Instant defect reports",
      description:
        "The moment a defect is raised during an inspection, a branded defect notice is generated and emailed directly to the nominated contractor — no manual follow-up required.",
    },
    {
      icon: Send,
      title: "Notify contractors or internal staff",
      description:
        "Assign defects to registered contractors, subcontractors or internal team members. Each recipient gets a clear, actionable notice with photos, NCC references and a required completion date.",
    },
    {
      icon: CheckCheck,
      title: "Track resolution in real time",
      description:
        "Monitor defect status — open, in progress, or resolved — from the dashboard. Receive updates when a contractor marks works complete and confirm closure with a follow-up inspection.",
    },
    {
      icon: Clock,
      title: "Full audit trail",
      description:
        "Every defect notice, acknowledgement and resolution is logged against the inspection record. If a dispute arises, the complete evidence chain is on hand.",
    },
  ];

  return (
    <section className="bg-gray-50 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* Left — copy */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#0B1933]/20 bg-[#0B1933]/5 px-4 py-1.5 mb-6">
              <AlertTriangle className="h-3.5 w-3.5 text-[#0B1933]" />
              <span className="text-xs font-medium text-[#0B1933] tracking-wide uppercase">
                Defect & Contractor Management
              </span>
            </div>
            <h2
              className="text-3xl sm:text-4xl font-normal text-[#0B1933] mb-5 leading-snug"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Raise a defect.<br />
              <span className="text-[#466DB5]">The right people are notified instantly.</span>
            </h2>
            <p className="text-gray-500 mb-10 leading-relaxed">
              When a defect is identified on site, InspectProof closes the loop automatically — generating a formal defect notice and dispatching it to the assigned contractor or staff member so nothing falls through the cracks.
            </p>
            <div className="space-y-7">
              {points.map((p) => (
                <div key={p.title} className="flex gap-4">
                  <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-[#0B1933]">
                    <p.icon className="h-4 w-4 text-[#C5D92D]" />
                  </div>
                  <div>
                    <p
                      className="font-semibold text-[#0B1933] mb-1"
                      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    >
                      {p.title}
                    </p>
                    <p className="text-sm text-gray-500 leading-relaxed">{p.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — mockup card */}
          <div className="relative flex flex-col gap-4">
            {/* Defect card */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-lg p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 border border-red-100 shrink-0">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-[#0B1933] text-sm">Defect Raised — Frame Inspection</p>
                  <p className="text-xs text-gray-400 mt-0.5">12 Ashgrove Crescent, Brisbane QLD — 9 Apr 2026</p>
                </div>
                <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 shrink-0">Open</span>
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 mb-4 text-sm text-gray-600 leading-relaxed">
                <strong className="text-[#0B1933]">Item:</strong> Diagonal bracing on north elevation non-compliant — bracing length insufficient per engineer's schedule.<br />
                <span className="text-xs text-gray-400 mt-1 block">NCC ref: AS 1684.2 Cl 8.4 · Risk: Critical · Photo attached</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Assigned to:</span>
                <span className="font-medium text-[#0B1933]">Timber Framing Co. — Mark Sullivan</span>
              </div>
            </div>

            {/* Notification sent card */}
            <div className="rounded-2xl border border-[#466DB5]/30 bg-[#466DB5]/5 shadow p-5 flex items-start gap-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#466DB5] shrink-0">
                <Send className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#0B1933] text-sm">Defect notice sent</p>
                <p className="text-xs text-gray-500 mt-0.5">mark.sullivan@timberfaming.com.au · Required by: 16 Apr 2026</p>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-semibold text-[#466DB5] shrink-0">
                <Zap className="h-3 w-3" />
                Instant
              </div>
            </div>

            {/* Resolution card */}
            <div className="rounded-2xl border border-green-200 bg-green-50 shadow p-5 flex items-start gap-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600 shrink-0">
                <CheckCheck className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#0B1933] text-sm">Defect resolved &amp; closed</p>
                <p className="text-xs text-gray-500 mt-0.5">Contractor marked complete · Confirmed by inspector · Logged to audit trail</p>
              </div>
            </div>
          </div>

        </div>

        {/* Wide image banner — fades into section background */}
        <div
          className="relative w-full mt-16 overflow-hidden"
          style={{
            height: "340px",
            maskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
          }}
        >
          <img
            src="/defect-contractor-site.png"
            alt="Inspector documenting a structural defect on site using a smartphone"
            className="w-full h-full object-cover"
            style={{ objectPosition: "70% center", filter: "brightness(0.92) contrast(1.06)" }}
          />
          {/* Horizontal colour overlay so text is readable */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to right, rgba(11,25,51,0.92) 0%, rgba(11,25,51,0.65) 35%, rgba(11,25,51,0.1) 58%, transparent 75%)" }}
          />
          {/* Text centred vertically on the left */}
          <div className="absolute inset-0 flex items-center px-10">
            <div className="max-w-xs">
              <div className="mb-3 h-0.5 w-10 bg-[#C5D92D]" />
              <p
                className="text-white text-xl sm:text-2xl font-semibold leading-snug"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Find it. Log it.{" "}
                <span className="text-[#C5D92D]">Close it out.</span>
              </p>
            </div>
          </div>
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
    checklistPreview: {
      templateName: "Frame Inspection — Class 1 Dwelling",
      items: [
        "Photograph overall frame from each elevation before inspection commences",
        "Verify frame layout and overall dimensions match endorsed construction drawings",
        "Confirm bottom plate hold-down bolts installed at correct spacing and kN capacity — NCC HP3.4.4",
        "Wall bracing type, location and nail pattern match the endorsed bracing layout plan",
        "Verify each truss connected to top plate with engineer-specified strap — NCC HP3.4.4",
        "Check structural members for unauthorised notching or drilling by plumbing and electrical trades",
      ],
    },
  },
  {
    icon: Building2,
    role: "Structural Engineers",
    description:
      "Document structural inspections at every stage — from footing inspections to final frame. InspectProof ensures your sign-off is backed by complete, timestamped evidence that stands up to scrutiny.",
    checklistPreview: {
      templateName: "Steel Frame Inspection — AS 4100",
      items: [
        "Steel members match approved drawings — sections, lengths and grades verified",
        "Bolted connections use correct bolt grade, size and quantity — no missing bolts",
        "Welds inspected for size, length and quality — no visible cracks or undercut",
        "Columns plumb and beams level within permitted tolerances — AS 4100 Cl 15",
        "Column base plates anchored with correct holding-down bolt pattern and size",
        "NATA-certified inspection report for welds and connections provided",
      ],
    },
  },
  {
    icon: Droplets,
    role: "Plumbing Inspectors",
    description:
      "Carry out plumbing inspections with purpose-built checklists covering AS/NZS standards. Issue plumbing compliance certificates from the field, without the paperwork.",
    checklistPreview: {
      templateName: "Rough-In Plumbing Inspection",
      items: [
        "Correct pipe material, class and jointing method used for each application — AS/NZS 3500.1",
        "Waste lines fall minimum 1:40 (2.5%) for horizontal pipes — AS/NZS 3500.2",
        "Vent pipes installed to correct height and diameter — not blocked by insulation",
        "All floor and wall penetrations sealed against vermin and fire-rated where required",
        "Air or water pressure test conducted on concealed supply lines — no pressure drop",
        "Rough-in inspection certificate completed and signed",
      ],
    },
  },
  {
    icon: HardHat,
    role: "Builders",
    description:
      "Take control of quality on-site without the paperwork. InspectProof gives builders a structured way to record quality checks at every stage, flag non-conformances and maintain a complete audit trail before handover.",
    checklistPreview: {
      templateName: "Defect Inspection",
      items: [
        "Walls — painting complete, no drips, runs, missed patches or substrate visible",
        "Ceilings — no cracking, staining, cornice gaps or paint defects",
        "All doors operate freely, latch correctly and are hung square without binding",
        "Kitchen and laundry cabinetry level, secure, soft-close hinges operational",
        "Tiles — grout lines consistent, no hollow-sounding tiles, no cracking or lippage",
        "Waterproofing visible below tiles in shower recess — no silicone gaps or movement",
      ],
    },
  },
  {
    icon: ClipboardCheck,
    role: "Site Supervisors",
    description:
      "Keep every trade and inspection on track from one place. Schedule inspections, log daily observations, manage hold points and ensure nothing slips through the cracks during construction.",
    checklistPreview: {
      templateName: "Daily Site Inspection — Site Supervisor",
      items: [
        "Site entry is controlled — hoarding, gates and signage in place and undamaged",
        "All workers on site wearing required PPE — hard hats, high-vis, safety boots",
        "Active work areas barricaded — overhead and exclusion zones clearly marked",
        "Materials stored safely — no unstable stacks, trip hazards or blocked emergency exits",
        "Scaffolding tags current — no unauthorised modifications or missing guardrails",
        "Daily pre-start meeting completed — trades briefed on today's hold points and critical activities",
      ],
    },
  },
  {
    icon: ShieldAlert,
    role: "WHS Officers",
    description:
      "Conduct site safety inspections systematically and build a defensible record of every audit. InspectProof gives WHS professionals the tools to document hazards, assign corrective actions and evidence compliance with the Work Health and Safety Act.",
    checklistPreview: {
      templateName: "WHS Site Safety Inspection",
      items: [
        "Emergency evacuation plan displayed and legible at site entry — assembly point clearly marked",
        "First aid kit stocked and accessible — qualified first aider on site during work hours",
        "Hazardous chemicals stored in compliant, bunded, labelled areas — SDS accessible on site",
        "Plant and equipment daily pre-start checks completed and records on site",
        "Electrical leads and RCDs tagged and tested — no damaged insulation or bypass devices",
        "All workers inducted — SWMS reviewed, signed and current for high-risk construction work",
      ],
    },
  },
  {
    icon: Home,
    role: "Pre-Purchase Inspectors",
    description:
      "Deliver thorough pre-purchase building reports with photo evidence and clear condition assessments. InspectProof standardises every inspection and produces client-ready reports in minutes.",
    checklistPreview: {
      templateName: "Pre-Purchase Building Inspection",
      items: [
        "Roof structure — rafters, battens and sarking inspected for damage, rot or termite activity",
        "Roof covering — tiles, metal sheet or membrane checked for cracking, lifting or corrosion",
        "Subfloor — bearers, joists and stumps inspected for decay, movement and ventilation",
        "Rising damp and moisture — probed walls and checked wet areas for staining, mould or salt attack",
        "Structural cracks assessed — width, location and orientation recorded with photos",
        "Condition report grading applied per AS 4349.1 — defects categorised and prioritised",
      ],
    },
  },
  {
    icon: Flame,
    role: "Fire Safety Engineers",
    description:
      "Record fire safety system inspections and produce evidence-backed compliance reports. InspectProof helps fire safety professionals manage annual fire safety statements, essential services and system audits.",
    checklistPreview: {
      templateName: "Annual Fire Safety Inspection",
      items: [
        "Sprinkler system — main isolation valve open, pressure gauges in normal range, no obstructions",
        "Fire detection and alarm system — panel in normal mode, no faults or isolations, zones verified",
        "Emergency and exit lighting — all fittings operational, charge indicators positive, lenses clean",
        "Fire doors — self-closing devices operational, no wedges or hold-opens, seals intact",
        "Portable fire extinguishers — correct type for hazard class, pressure in green, within service date",
        "Annual Fire Safety Statement prepared — all essential services listed and graded",
      ],
    },
  },
  {
    icon: Key,
    role: "Property Managers",
    description:
      "Conduct ingoing and outgoing property inspections with a complete photographic record. Protect your clients and reduce disputes with timestamped evidence and standardised condition reports.",
    checklistPreview: {
      templateName: "Routine Property Inspection",
      items: [
        "General cleanliness — all rooms, wet areas and common spaces inspected and condition noted",
        "Walls and ceilings — any new damage, staining or unauthorised fixtures noted and photographed",
        "Floor coverings — carpets and hard floors inspected for damage, staining or wear beyond fair use",
        "All smoke alarms tested and operational — battery condition noted — Building Fire Safety Regulation",
        "Hot water system, air conditioning and fixed appliances checked for operation — faults noted",
        "Yard and external areas — gardens maintained per lease conditions, no unapproved structures",
      ],
    },
  },
  {
    icon: Waves,
    role: "Pool Inspectors",
    description:
      "Inspect pool barriers against AS 1926.1 compliance requirements, document non-conformances on-site and issue pool safety certificates — reducing risk and liability for owners and agents.",
    checklistPreview: {
      templateName: "Pool Barrier Compliance Inspection — AS 1926.1",
      items: [
        "Pool barrier height minimum 1200mm above finished ground level on non-climbable zone side — AS 1926.1 Cl 2.2",
        "Non-climbable zone (NCZ) 900mm clear on outside of barrier — no climbable objects within NCZ",
        "Self-closing and self-latching gate tested — held ajar and released; latch engages positively",
        "Gate latch positioned minimum 1500mm above ground or on pool-side of barrier — AS 1926.1 Cl 2.7",
        "No direct access from habitable building to pool area — compliant barrier or resettable latch at all doorways",
        "Pool safety certificate completed — rectification items and re-inspection requirements noted",
      ],
    },
  },
  {
    icon: FileSearch,
    role: "Insurance Assessors",
    description:
      "Document property damage with systematic photo evidence, categorise loss against policy wording and prepare reinstatement cost estimates — creating defensible assessment records for every claim.",
    checklistPreview: {
      templateName: "Property Damage Assessment — Insurance Inspection",
      items: [
        "Property access confirmed — insured present, policy details and claim number verified before inspection commences",
        "Damage scope defined — storm, fire, flood, impact or gradual damage categorised per policy wording",
        "All affected areas photographed systematically — roof, structure, interior and contents — timestamped",
        "Building structure assessed for safety to occupy — structural engineer referral recommended where required",
        "Cause of damage documented — weather event data, incident reports or investigation findings referenced",
        "Reinstatement cost estimate prepared — itemised scope of works with current Australian market rates applied",
      ],
    },
  },
];

function Professionals() {
  const [active, setActive] = useState(0);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const p = PROFESSIONALS[active];

  return (
    <>
      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}
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
              Built for professionals<br />working within Australia's built environment
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
              <button
                onClick={() => setShowWaitlist(true)}
                className="inline-flex items-center gap-2 rounded-md bg-[#C5D92D] px-6 py-3 text-sm font-semibold text-[#0B1933] hover:bg-[#d4e83a] transition-colors"
              >
                Request Early Access <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="w-full">
              <div className="rounded-xl border border-white/10 bg-[#0B1933]/60 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/5">
                  <CheckCircle2 className="h-4 w-4 text-[#C5D92D] shrink-0" />
                  <span className="text-xs font-semibold text-white/80 tracking-wide truncate">
                    {p.checklistPreview.templateName}
                  </span>
                </div>
                <ul className="divide-y divide-white/5">
                  {p.checklistPreview.items.map((item) => (
                    <li key={item} className="flex items-start gap-3 px-4 py-3">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#C5D92D]/15 border border-[#C5D92D]/40">
                        <CheckCircle2 className="h-3 w-3 text-[#C5D92D]" />
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                        <span className="text-white/65 text-xs leading-relaxed">{item}</span>
                        <span className="shrink-0 rounded-full bg-[#C5D92D]/15 px-2 py-0.5 text-[10px] font-semibold text-[#C5D92D] border border-[#C5D92D]/30">
                          Pass
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
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

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
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

        {/* Wide image banner — diagonal split style */}
        <div className="relative w-full h-64 sm:h-80 overflow-hidden flex">
          {/* Photo fills the full frame */}
          <img
            src="/how-it-works-real.png"
            alt="Inspector using a tablet to conduct an inspection inside a building"
            className="absolute inset-0 w-full h-full object-cover object-center"
            style={{ filter: "brightness(0.9) contrast(1.05)" }}
          />
          {/* Dark panel on the left with diagonal right edge */}
          <div
            className="relative z-10 flex items-center px-8 py-8"
            style={{
              width: "48%",
              background: "linear-gradient(135deg, rgba(11,25,51,0.98) 0%, rgba(11,25,51,0.92) 100%)",
              clipPath: "polygon(0 0, 100% 0, 82% 100%, 0 100%)",
            }}
          >
            <p
              className="text-white text-xl sm:text-2xl font-semibold leading-snug pr-8"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Every inspection.<br />
              Every record.<br />
              <span className="text-[#C5D92D]">Every time.</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  const [showWaitlist, setShowWaitlist] = useState(false);

  return (
    <>
      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}
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
                New accounts are currently by invitation only. Join the waitlist and we'll be in touch when we open up for your profession.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => setShowWaitlist(true)}
                  className="inline-flex items-center gap-2 rounded-md bg-[#C5D92D] px-8 py-3.5 text-base font-semibold text-[#0B1933] hover:bg-[#d4e83a] transition-colors shadow-lg shadow-[#C5D92D]/20"
                >
                  Join the Waitlist <ArrowRight className="h-4 w-4" />
                </button>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-8 py-3.5 text-base font-medium text-white hover:bg-white/10 transition-colors"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
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
      <DefectSection />
      <Professionals />
      <HowItWorks />
      <CTA />
      <Footer />
    </div>
  );
}
