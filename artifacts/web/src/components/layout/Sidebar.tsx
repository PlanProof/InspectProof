import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Home,
  FolderOpen,
  CheckSquare,
  BarChart3,
  UsersRound,
  Settings,
  LogOut,
  FileText,
  ShieldCheck,
  Zap,
  AlertTriangle,
  Activity,
  CalendarDays,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const navigation = [
  { name: "Home",        href: "/dashboard",   icon: Home },
  { name: "Projects",    href: "/projects",    icon: FolderOpen },
  { name: "Inspections", href: "/inspections", icon: CheckSquare },
  { name: "Calendar",    href: "/calendar",    icon: CalendarDays },
  { name: "Issues",      href: "/issues",      icon: AlertTriangle },
  { name: "Templates",   href: "/templates",   icon: FileText },
  { name: "Analytics",   href: "/analytics",   icon: BarChart3 },
  { name: "Activity",    href: "/activity",    icon: Activity },
  { name: "Team",        href: "/inspectors",  icon: UsersRound },
];

function useOrgName(apiCompanyName: string | null | undefined): string | null {
  const [localOrg, setLocalOrg] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("inspectproof_org_details");
      if (stored) {
        const parsed = JSON.parse(stored);
        setLocalOrg(parsed?.name?.trim() || null);
      }
    } catch {}
  }, []);
  return apiCompanyName || localOrg || null;
}

export function Sidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const orgName = useOrgName(user?.companyName);

  return (
    <div className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl">
      <div className="shrink-0 flex items-center px-5 gap-3 border-b border-white/10 py-4 min-h-16">
        <img src={`${import.meta.env.BASE_URL}logo-dark.png`} alt="InspectProof" className="h-8 w-8 shrink-0 object-contain" />
        <div className="flex flex-col min-w-0">
          <span className="text-[#F2F3F4] leading-none" style={{ fontFamily: "'OddliniUX', sans-serif", fontWeight: 500, letterSpacing: "0.02em", lineHeight: 1 }}>InspectProof</span>
          {orgName && (
            <span className="text-white/50 text-[11px] font-medium mt-1.5 truncate leading-none">{orgName}</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto pt-6 px-4 pb-4">
        <nav className="flex-1 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href || location.startsWith(`${item.href}/`)
              || (item.href === "/templates" && location === "/doc-templates");
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "group flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-md"
                    : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon
                  className={cn(
                    "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                    isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/50 group-hover:text-white"
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-white/10 p-4 space-y-1">
        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <div className="h-7 w-7 rounded-full bg-secondary/40 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
              {`${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-white/90 truncate leading-none">{user.firstName} {user.lastName}</p>
              <p className="text-[10px] text-white/40 truncate mt-0.5 leading-none">{user.email}</p>
            </div>
          </div>
        )}
        {user && (user.isCompanyAdmin || user.isAdmin) && user.plan === "free_trial" && (
          <Link
            href="/billing"
            className={cn(
              "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
              location === "/billing"
                ? "bg-[#C5D92D]/20 text-[#C5D92D]"
                : "bg-[#C5D92D]/10 text-[#C5D92D] hover:bg-[#C5D92D]/20"
            )}
          >
            <Zap className="mr-3 h-5 w-5 flex-shrink-0" />
            Upgrade plan
          </Link>
        )}
        {user?.isAdmin && (
          <Link
            href="/admin"
            className={cn(
              "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
              location === "/admin" || location.startsWith("/admin/")
                ? "bg-[#C5D92D]/20 text-[#C5D92D]"
                : "text-[#C5D92D]/70 hover:bg-[#C5D92D]/10 hover:text-[#C5D92D]"
            )}
          >
            <ShieldCheck className="mr-3 h-5 w-5 flex-shrink-0" />
            Admin dashboard
          </Link>
        )}
        <Link
          href="/settings"
          className={cn(
            "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
            location === "/settings"
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-white"
          )}
        >
          <Settings className="mr-3 h-5 w-5 text-sidebar-foreground/50 group-hover:text-white" />
          Settings
        </Link>
        <button
          onClick={logout}
          className="group flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut className="mr-3 h-5 w-5 text-sidebar-foreground/50 group-hover:text-white" />
          Sign out
        </button>
      </div>
    </div>
  );
}
