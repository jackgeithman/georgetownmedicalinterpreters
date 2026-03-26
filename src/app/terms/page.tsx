export const metadata = { title: "Terms of Service — Georgetown Medical Interpreters" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="border-b-4 border-[#002147] pb-4 mb-10">
          <h1 className="text-2xl font-bold text-[#002147]">Georgetown Medical Interpreters</h1>
          <p className="text-sm text-stone-400 mt-1">Terms of Service</p>
        </div>

        <p className="text-sm text-stone-400 mb-10">Last updated: March 2026</p>

        <div className="space-y-8 text-stone-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">1. Acceptance of Terms</h2>
            <p>
              By signing in to the Georgetown Medical Interpreters platform (&ldquo;GMI&rdquo;,
              &ldquo;the platform&rdquo;), you agree to these terms. If you do not agree, do not
              use the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">2. Eligibility</h2>
            <p>
              The platform is available to Georgetown University students, staff, and approved
              volunteers who have been granted access by a GMI administrator. Access is
              non-transferable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">3. Volunteer Responsibilities</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Only sign up for shifts you are qualified and available to complete.</li>
              <li>Cancel as early as possible if you cannot attend a scheduled shift.</li>
              <li>Repeated no-shows or last-minute cancellations may result in suspension of access.</li>
              <li>You are responsible for arriving on time and fulfilling your interpreter duties professionally.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">4. Account Use</h2>
            <p>
              You are responsible for maintaining the security of your account. Do not share
              your login credentials. GMI administrators reserve the right to suspend or
              revoke access at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">5. Notifications</h2>
            <p>
              By using the platform, you consent to receiving email notifications and Google
              Calendar invites related to your shift signups, cancellations, and reminders.
              You may adjust notification preferences in your profile settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">6. Limitation of Liability</h2>
            <p>
              The platform is provided as-is for internal program coordination. Georgetown
              Medical Interpreters is not liable for any issues arising from missed shifts,
              technical outages, or miscommunications facilitated through the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">7. Changes to Terms</h2>
            <p>
              We may update these terms at any time. Continued use of the platform after
              changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">8. Contact</h2>
            <p>
              Questions about these terms? Contact us at{" "}
              <a href="mailto:georgetownmedicalinterpreters@gmail.com" className="text-[#002147] underline">
                georgetownmedicalinterpreters@gmail.com
              </a>.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-stone-200 text-xs text-stone-400">
          Georgetown Medical Interpreters &middot; georgetownmedicalinterpreters.org
        </div>
      </div>
    </div>
  );
}
