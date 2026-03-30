import { Link } from "wouter";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
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
          <h1 className="text-3xl font-bold text-sidebar mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: 1 January 2025</p>
        </div>

        <div className="prose prose-sm max-w-none text-foreground space-y-8">

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">1. Our Commitment to Your Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              PlanProof Pty Ltd (ABN 25 690 548 406), trading as InspectProof ("we", "us", "our"), is committed to protecting your personal information in accordance with the <strong>Privacy Act 1988 (Cth)</strong> and the Australian Privacy Principles (APPs).
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              This Privacy Policy explains how we collect, hold, use and disclose personal information in connection with the InspectProof platform ("Platform"). By using the Platform, you agree to the handling of your personal information as described in this policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">2. What Personal Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed">We may collect the following types of personal information:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li><strong>Account information:</strong> your name, email address, phone number, professional role, and company name</li>
              <li><strong>Billing information:</strong> payment card details (processed and stored by our payment provider Stripe — we do not store card numbers)</li>
              <li><strong>Professional information:</strong> certifier or inspector licence details, professional discipline, and signature</li>
              <li><strong>Project and inspection data:</strong> site addresses, client names, inspection notes, photographs, documents and reports you upload or create using the Platform</li>
              <li><strong>Usage data:</strong> log data, device information, IP addresses, browser type, and how you interact with the Platform</li>
              <li><strong>Communications:</strong> emails or messages you send to us</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">3. How We Collect Personal Information</h2>
            <p className="text-muted-foreground leading-relaxed">We collect personal information:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Directly from you when you register for an account, update your profile, or contact us</li>
              <li>When you use the Platform and create projects, inspections, documents or reports</li>
              <li>Automatically through cookies, log files and other tracking technologies when you access the Platform</li>
              <li>From third parties such as our payment processor (Stripe) and push notification services</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">4. How We Use Your Personal Information</h2>
            <p className="text-muted-foreground leading-relaxed">We use your personal information to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Provide, operate and improve the Platform</li>
              <li>Create and manage your account</li>
              <li>Process subscription payments and send billing communications</li>
              <li>Send you service-related notifications (e.g. inspection assignments, report updates)</li>
              <li>Respond to your enquiries and provide customer support</li>
              <li>Send product updates and platform announcements (you may opt out at any time)</li>
              <li>Comply with our legal obligations</li>
              <li>Detect and prevent fraud, security incidents, and abuse of the Platform</li>
              <li>Conduct aggregate, anonymised analytics to improve our services</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              We will not use your personal information for any purpose that is unrelated to the above without your prior consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">5. Data Isolation and Account Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your project data, inspection records, documents, reports and client information are strictly private to your account. No other user of the Platform can access your data. We implement technical controls to enforce this isolation at every level of the Platform.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Platform administrators have access to account-level metadata (such as usage counts) for the purposes of billing and support, but do not access the content of your projects, documents or inspection reports except where required to resolve a support issue and with your consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">6. Disclosure of Personal Information</h2>
            <p className="text-muted-foreground leading-relaxed">We do not sell your personal information. We may disclose your information to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li><strong>Service providers:</strong> trusted third parties who assist us in operating the Platform, including cloud hosting providers, payment processors (Stripe), email delivery services (Resend), and push notification services. These providers are contractually required to protect your information and may only use it to provide services to us.</li>
              <li><strong>Law enforcement or regulators:</strong> where required by law, court order, or government authority.</li>
              <li><strong>Successors:</strong> in the event of a merger, acquisition or sale of all or part of our business, your information may be transferred to the acquiring entity.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Where we disclose personal information to overseas recipients (e.g. cloud infrastructure providers), we take reasonable steps to ensure those recipients comply with privacy standards equivalent to the Australian Privacy Principles.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">7. Data Storage and Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              All data is stored on servers located in Australia. We implement industry-standard security measures including encrypted data transmission (TLS/HTTPS), encrypted storage for sensitive data, access controls, and regular security reviews.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              While we take reasonable steps to protect your personal information, no method of transmission over the internet or electronic storage is completely secure. We cannot guarantee absolute security, and you use the Platform at your own risk.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              In the event of a data breach that is likely to result in serious harm, we will notify affected individuals and the Office of the Australian Information Commissioner (OAIC) as required by the Notifiable Data Breaches scheme.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">8. Cookies and Tracking</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Platform uses cookies and similar technologies to maintain your session, remember your preferences, and analyse usage patterns. You can control cookie settings through your browser, but disabling cookies may affect the functionality of the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">9. Retention of Personal Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your personal information for as long as your account is active or as necessary to provide you with the Platform. We also retain information as required to comply with our legal obligations, resolve disputes, and enforce our agreements.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Upon account cancellation, you may request an export of your data within 30 days. After that period, your data will be securely deleted from our systems, except where we are required by law to retain it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">10. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">Under the Privacy Act 1988, you have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li><strong>Access:</strong> request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> request that we correct inaccurate, incomplete or outdated personal information</li>
              <li><strong>Deletion:</strong> request deletion of your personal information (subject to our legal obligations)</li>
              <li><strong>Opt out:</strong> unsubscribe from marketing communications at any time</li>
              <li><strong>Complain:</strong> make a complaint about how we have handled your personal information</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              To exercise any of these rights, please contact us at <a href="mailto:contact@inspectproof.com.au" className="text-secondary underline">contact@inspectproof.com.au</a>. We will respond to your request within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">11. Complaints</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you believe we have breached the Australian Privacy Principles or your privacy rights, please contact us in the first instance. We will investigate and respond within 30 days. If you are not satisfied with our response, you may lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at <a href="https://www.oaic.gov.au" className="text-secondary underline" target="_blank" rel="noreferrer">oaic.gov.au</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">12. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of material changes by email and by updating the date at the top of this page. We encourage you to review this policy periodically.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">13. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              For privacy enquiries, requests or complaints, please contact our Privacy Officer:
            </p>
            <div className="mt-3 bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
              <p className="font-medium text-sidebar">Privacy Officer — PlanProof Pty Ltd</p>
              <p>Trading as InspectProof</p>
              <p className="mt-1">
                Email: <a href="mailto:contact@inspectproof.com.au" className="text-secondary underline">contact@inspectproof.com.au</a>
              </p>
              <p>Website: <a href="https://inspectproof.com.au" className="text-secondary underline">inspectproof.com.au</a></p>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-8">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} PlanProof Pty Ltd. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/terms" className="underline hover:text-foreground">Terms & Conditions</Link>
            <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
