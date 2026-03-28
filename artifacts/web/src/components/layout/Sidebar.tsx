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
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const navigation = [
  { name: "Home",        href: "/dashboard",   icon: Home },
  { name: "Projects",    href: "/projects",    icon: FolderOpen },
  { name: "Inspections", href: "/inspections", icon: CheckSquare },
  { name: "Templates",   href: "/templates",   icon: FileText },
  { name: "Analytics",   href: "/analytics",   icon: BarChart3 },
  { name: "Inspectors",  href: "/inspectors",  icon: UsersRound },
];

export function Sidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();

  return (
    <div className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl">
      <div className="flex h-16 shrink-0 items-center px-5 gap-3 border-b border-white/10">
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
          <rect width="40" height="40" rx="6" fill="#466DB5"/>
          <rect x="7" y="11" width="26" height="25" rx="2" fill="#F2F3F4"/>
          <rect x="15" y="7" width="10" height="7" rx="2" fill="#F2F3F4"/>
          <rect x="10" y="16" width="20" height="2" rx="1" fill="#466DB5"/>
          <rect x="10" y="21" width="20" height="2" rx="1" fill="#466DB5"/>
          <rect x="10" y="26" width="20" height="2" rx="1" fill="#466DB5"/>
        </svg>
        <span className="text-[#F2F3F4] leading-none" style={{ fontFamily: "'OddliniUX', sans-serif", fontWeight: 500, letterSpacing: "0.02em", lineHeight: 1 }}>InspectProof</span>
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
        {user && user.plan === "free_trial" && (
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
