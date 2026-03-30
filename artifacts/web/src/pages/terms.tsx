import { Link } from "wouter";

export default function Terms() {
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
          <h1 className="text-3xl font-bold text-sidebar mb-2">Terms and Conditions</h1>
          <p className="text-sm text-muted-foreground">Last updated: 1 January 2025</p>
        </div>

        <div className="prose prose-sm max-w-none text-foreground space-y-8">

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">1. About These Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms and Conditions ("Terms") govern your access to and use of the InspectProof platform ("Platform"), operated by PlanProof Pty Ltd ABN 25 690 548 406 ("we", "us", "our"). By creating an account or using the Platform, you agree to be bound by these Terms. If you do not agree, do not use the Platform.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              These Terms are governed by the laws of New South Wales, Australia, and you submit to the non-exclusive jurisdiction of the courts of that state.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">2. The Platform</h2>
            <p className="text-muted-foreground leading-relaxed">
              InspectProof is a building inspection and certification management platform designed for building surveyors, certifiers, inspectors and related professionals in Australia. The Platform allows users to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Create and manage building inspection projects</li>
              <li>Conduct and record site inspections using digital checklists</li>
              <li>Generate, manage and distribute inspection certificates and reports</li>
              <li>Store and access project documents and photographs</li>
              <li>Annotate and mark up documents</li>
              <li>Manage compliance issues and corrective actions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">3. Accounts and Access</h2>
            <p className="text-muted-foreground leading-relaxed">
              To use the Platform you must register for an account. You agree to provide accurate, current and complete information during registration and to keep that information up to date. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              You must not share your account credentials with any other person. You must notify us immediately at <a href="mailto:contact@inspectproof.com.au" className="text-secondary underline">contact@inspectproof.com.au</a> if you become aware of any unauthorised use of your account.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              We reserve the right to suspend or terminate any account where we reasonably suspect a breach of these Terms, fraudulent activity, or non-payment of applicable fees.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">4. Subscription Plans and Billing</h2>
            <p className="text-muted-foreground leading-relaxed">
              Access to the Platform is provided on a subscription basis. Details of available plans, pricing, and included features are set out on our pricing page. All prices are in Australian Dollars (AUD) and are inclusive of GST unless otherwise stated.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Subscriptions are billed in advance on a monthly or annual basis depending on your selected plan. You authorise us to charge your nominated payment method for all applicable fees. Subscription fees are non-refundable except as required by the Australian Consumer Law.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              We may change our pricing with 30 days' written notice to your registered email address. Continued use of the Platform after the effective date of a price change constitutes acceptance of the new pricing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">5. Free Trial</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may offer a free trial period for new users. The duration and conditions of any free trial will be specified at the time of sign-up. At the end of the free trial, your account will automatically convert to a paid subscription unless you cancel before the trial period ends. We will notify you by email before any charges are applied.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">6. Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed">You agree to use the Platform only for lawful purposes and in accordance with these Terms. You must not:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Use the Platform for any purpose that is illegal or prohibited by these Terms</li>
              <li>Upload or transmit any content that is defamatory, offensive, fraudulent or that infringes any third-party rights</li>
              <li>Attempt to gain unauthorised access to any part of the Platform or to any other user's account or data</li>
              <li>Use the Platform to generate false, misleading or fraudulent inspection records or certificates</li>
              <li>Reverse-engineer, decompile or attempt to extract the source code of the Platform</li>
              <li>Resell or sub-license access to the Platform without our prior written consent</li>
              <li>Use the Platform in a way that could damage, disable or impair its operation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">7. Your Data</h2>
            <p className="text-muted-foreground leading-relaxed">
              You retain ownership of all data, content, photographs and documents you upload to the Platform ("Your Data"). By uploading Your Data, you grant us a limited, non-exclusive licence to store, process and display Your Data solely for the purpose of providing the Platform to you.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Your Data is kept strictly private to your account. We do not share, sell or provide access to Your Data to other users or third parties except as set out in our Privacy Policy or as required by law.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              You are responsible for ensuring that any data you upload does not infringe third-party rights and that you have obtained all necessary consents (including from your clients) to collect and store the data in accordance with applicable privacy laws.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">8. Professional Responsibility</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Platform is a tool to assist you in managing your inspection and certification work. It does not replace your professional judgement or your obligations under applicable legislation, including the Building Code of Australia, the Environmental Planning and Assessment Act 1979 (NSW), and any other relevant state or territory legislation.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              You are solely responsible for the accuracy and completeness of all inspection records, certificates and reports you generate using the Platform. We accept no liability for decisions made or actions taken in reliance on any content generated by the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">9. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Platform, including its design, software, trademarks, and content (excluding Your Data), is owned by or licensed to PlanProof Pty Ltd. Nothing in these Terms transfers any intellectual property rights to you. You may not use our trademarks, logo or branding without our prior written consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">10. Availability and Support</h2>
            <p className="text-muted-foreground leading-relaxed">
              We will use reasonable endeavours to make the Platform available at all times, but do not guarantee uninterrupted availability. We may take the Platform offline temporarily for maintenance, upgrades or to address security issues. We will provide reasonable advance notice of scheduled maintenance where possible.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">11. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, our total liability to you for any loss or damage arising from or related to these Terms or your use of the Platform is limited to the total fees paid by you in the 12 months preceding the event giving rise to the claim.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              We exclude all implied warranties and conditions to the maximum extent permitted by the Australian Consumer Law. Nothing in these Terms excludes, restricts or modifies any right or remedy, or any guarantee, warranty or other term or condition implied or imposed by the Australian Consumer Law that cannot be excluded.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">12. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              You may cancel your account at any time through the billing settings in your account dashboard. Cancellation takes effect at the end of your current billing period. You will retain access to the Platform until that date.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Upon termination or cancellation, you may request an export of Your Data within 30 days. After that period, we may permanently delete Your Data from our systems.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">13. Changes to These Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update these Terms from time to time. We will notify you of material changes by email to your registered address at least 14 days before the changes take effect. Your continued use of the Platform after the effective date constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-sidebar mb-3">14. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms, please contact us at:
            </p>
            <div className="mt-3 bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
              <p className="font-medium text-sidebar">PlanProof Pty Ltd</p>
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
