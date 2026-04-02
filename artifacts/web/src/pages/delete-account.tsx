import { Link } from "wouter";

export default function DeleteAccount() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-border bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <img src="/logo-light.png" alt="InspectProof" className="h-8 cursor-pointer" />
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to sign in
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-[#0B1933] mb-2">Delete Your Account</h1>
          <p className="text-sm text-muted-foreground">InspectProof — Account Data Deletion Policy</p>
        </div>

        <div className="prose prose-sm max-w-none text-foreground space-y-8">

          <section>
            <h2 className="text-lg font-semibold text-[#0B1933] mb-3">How to Delete Your Account</h2>
            <p className="text-muted-foreground leading-relaxed">
              You can delete your InspectProof account at any time directly from within the app. Follow the steps below:
            </p>
            <ol className="list-decimal list-inside space-y-2 mt-4 text-muted-foreground leading-relaxed">
              <li>Open the <strong className="text-foreground">InspectProof</strong> app on your device.</li>
              <li>Tap the <strong className="text-foreground">Settings</strong> tab at the bottom of the screen.</li>
              <li>Scroll to the bottom and tap <strong className="text-foreground">Delete Account</strong>.</li>
              <li>Read the confirmation message and tap <strong className="text-foreground">Delete Account</strong> to confirm.</li>
            </ol>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Your account will be permanently deleted immediately. You will be signed out and will not be able to log back in.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0B1933] mb-3">What Data Is Deleted</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              When you delete your account, the following personal data is permanently and irreversibly removed from our systems:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Your full name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Profile photo and signature image</li>
              <li>Account login credentials</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0B1933] mb-3">What Data Is Retained</h2>
            <p className="text-muted-foreground leading-relaxed">
              Inspection records, certifications, checklists, photos, and documents are company-owned records that may be subject to mandatory retention periods under the <em>Building Act</em> and related Australian legislation. These records are retained by your company and are not deleted when you remove your personal account.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Any inspection records associated with your account will be anonymised — your personal details will be removed from those records but the records themselves will remain in the company's account for compliance purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0B1933] mb-3">Request Deletion by Email</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you are unable to access the app, you can request account deletion by emailing us at:
            </p>
            <p className="mt-3">
              <a
                href="mailto:support@inspectproof.com.au?subject=Account%20Deletion%20Request"
                className="text-[#466DB5] font-medium hover:underline"
              >
                support@inspectproof.com.au
              </a>
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Please include the email address associated with your account. We will process your request within 30 days and confirm deletion by email.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0B1933] mb-3">Questions</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about data deletion or your privacy rights, please contact us at{" "}
              <a href="mailto:support@inspectproof.com.au" className="text-[#466DB5] hover:underline">
                support@inspectproof.com.au
              </a>
              {" "}or visit our{" "}
              <Link href="/privacy" className="text-[#466DB5] hover:underline">Privacy Policy</Link>.
            </p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground">
            InspectProof is operated by PlanProof Pty Ltd ABN 25 690 548 406.{" "}
            <Link href="/terms" className="hover:underline">Terms</Link>
            {" · "}
            <Link href="/privacy" className="hover:underline">Privacy</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
