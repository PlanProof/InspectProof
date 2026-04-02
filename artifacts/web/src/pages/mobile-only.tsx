import { useAuth } from "@/hooks/use-auth";
import { Smartphone } from "lucide-react";

export default function MobileOnlyPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-4 bg-blue-50 rounded-full">
            <Smartphone className="h-10 w-10 text-blue-500" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-sidebar">Mobile Access Only</h1>
          {user && (
            <p className="text-sm text-muted-foreground mt-1">
              Signed in as {user.firstName} {user.lastName}
            </p>
          )}
        </div>

        <p className="text-muted-foreground text-sm leading-relaxed">
          Your account is set up for mobile use only. The InspectProof web platform is not included in your current team plan.
        </p>

        <div className="bg-muted/40 rounded-xl p-4 text-sm text-muted-foreground text-left space-y-2">
          <p className="font-semibold text-sidebar">What you can do:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Download the InspectProof app</li>
            <li>Conduct inspections on mobile</li>
            <li>View your assigned projects</li>
          </ul>
          <p className="font-semibold text-sidebar mt-3">To get web access:</p>
          <p>Ask your administrator to upgrade their plan to Starter or higher.</p>
        </div>

        <div className="flex gap-3">
          <a
            href="https://apps.apple.com/au/app/inspectproof"
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center justify-center bg-[#0B1933] text-white rounded-xl py-3 px-4 text-sm font-semibold hover:bg-[#0B1933]/90 transition-colors"
          >
            App Store
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=com.inspectproof"
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center justify-center bg-[#0B1933] text-white rounded-xl py-3 px-4 text-sm font-semibold hover:bg-[#0B1933]/90 transition-colors"
          >
            Google Play
          </a>
        </div>

        <button
          onClick={logout}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
