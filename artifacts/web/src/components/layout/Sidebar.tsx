import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Home,
  FolderOpen,
  CheckSquare,
  BarChart3,
  ClipboardList,
  UsersRound,
  Settings,
  LogOut,
  FileText,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const navigation = [
  { name: "Home",        href: "/dashboard",      icon: Home },
  { name: "Inspections", href: "/inspections",    icon: CheckSquare },
  { name: "Projects",    href: "/projects",       icon: FolderOpen },
  { name: "Checklists",  href: "/templates",      icon: ClipboardList },
  { name: "Templates",   href: "/doc-templates",  icon: FileText },
  { name: "Analytics",   href: "/analytics",      icon: BarChart3 },
  { name: "Inspectors",  href: "/inspectors",     icon: UsersRound },
];

export function Sidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <div className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl">
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-white/10">
        <img src="/logo.png" alt="InspectProof" className="h-8 w-auto" />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto pt-6 px-4 pb-4">
        <nav className="flex-1 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href || location.startsWith(`${item.href}/`);
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
