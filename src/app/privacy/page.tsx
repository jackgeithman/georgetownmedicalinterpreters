export const metadata = { title: "Privacy Policy — Georgetown Medical Interpreters" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="border-b-4 border-[#002147] pb-4 mb-10">
          <h1 className="text-2xl font-bold text-[#002147]">Georgetown Medical Interpreters</h1>
          <p className="text-sm text-stone-400 mt-1">Privacy Policy</p>
        </div>

        <p className="text-sm text-stone-400 mb-10">Last updated: March 2026</p>

        <div className="space-y-8 text-stone-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">1. Overview</h2>
            <p>
              Georgetown Medical Interpreters (&ldquo;GMI&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates
              this volunteer scheduling platform. This policy explains what information we collect, how we use
              it, and your rights regarding your data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">2. Information We Collect</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Google account information</strong> — your name and email address, provided when you sign in with Google.</li>
              <li><strong>Volunteer profile data</strong> — languages you speak, hours volunteered, and shift history.</li>
              <li><strong>Shift and signup records</strong> — dates, times, and clinic assignments associated with your account.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>To match volunteers with interpreter shifts at partner clinics.</li>
              <li>To send email notifications about your signups, cancellations, and reminders.</li>
              <li>To create and manage Google Calendar events for your scheduled shifts.</li>
              <li>To track volunteer hours and program participation.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">4. Google OAuth &amp; Calendar</h2>
            <p>
              We use Google Sign-In to authenticate users. We access your Google account email and name only.
              We do <strong>not</strong> access, read, or store any data from your Google Calendar, Gmail,
              Drive, or other Google services beyond what is needed to send you shift-related calendar invites
              via the Google Calendar API.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">5. Data Sharing</h2>
            <p>
              We do not sell or share your personal information with third parties. Your name and language
              skills may be visible to clinic staff and GMI administrators for the purpose of coordinating
              interpreter assignments. Email notifications are sent via Gmail API and Resend.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">6. Data Retention</h2>
            <p>
              Your account and shift history are retained for program record-keeping purposes. You may
              request deletion of your account by contacting a GMI administrator.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#002147] mb-3">7. Contact</h2>
            <p>
              For questions about this policy or your data, contact Georgetown Medical Interpreters at{" "}
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
