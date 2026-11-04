import { useLocation } from "wouter";
import { ArrowLeft, Shield } from "lucide-react";

const LAST_UPDATED = "May 19, 2026";
const CONTACT_EMAIL = "privacy@tancom.us";
const APP_NAME = "TanCom";
const COMPANY_NAME = "TanCom, Inc.";
const WEBSITE = "https://tancom.us";

export default function PrivacyPolicyPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <div className="bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
          </div>
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {APP_NAME}
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-gray-500 text-sm">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">

        {/* Introduction */}
        <section>
          <p className="text-gray-700 leading-relaxed">
            {COMPANY_NAME} ("we," "us," or "our") operates the {APP_NAME} video conferencing
            platform available at <a href={WEBSITE} className="text-blue-600 hover:underline">{WEBSITE}</a> and
            via our mobile and desktop applications (collectively, the "Service"). This Privacy Policy
            explains how we collect, use, disclose, and protect your personal information when you use
            the Service. By accessing or using the Service, you agree to the terms of this Privacy Policy.
          </p>
        </section>

        <Section title="1. Information We Collect">
          <SubSection title="1.1 Information You Provide Directly">
            <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
              <li><strong>Account information:</strong> name, email address, and password when you sign up.</li>
              <li><strong>Profile information:</strong> display name, profile photo, and timezone.</li>
              <li><strong>Meeting content:</strong> audio, video, and screen-share streams during live sessions.</li>
              <li><strong>Chat messages:</strong> text messages sent in meetings and in the Chat feature.</li>
              <li><strong>Contact list:</strong> contacts you add manually or import into the Service.</li>
              <li><strong>Support communications:</strong> information you provide when contacting us for help.</li>
            </ul>
          </SubSection>

          <SubSection title="1.2 Information Collected Automatically">
            <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
              <li><strong>Usage data:</strong> pages visited, features used, session duration, and meeting metadata (start/end time, participant count).</li>
              <li><strong>Device data:</strong> device type, operating system, browser type and version, unique device identifiers.</li>
              <li><strong>Network data:</strong> IP address, approximate geographic location (country/region), and connection quality metrics.</li>
              <li><strong>Log data:</strong> server logs including access times, errors, and request details.</li>
              <li><strong>Cookies and similar technologies:</strong> session cookies for authentication and preference storage. We do not use tracking or advertising cookies.</li>
            </ul>
          </SubSection>

          <SubSection title="1.3 Information from Third-Party Services">
            <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
              <li><strong>Authentication (Clerk):</strong> when you sign in, Clerk processes your credentials and provides us with a user identifier and basic profile information.</li>
              <li><strong>Video infrastructure (LiveKit):</strong> LiveKit powers real-time audio and video. LiveKit may process metadata (room identifiers, participant counts) to provide the service.</li>
              <li><strong>SMS notifications (Twilio):</strong> if you opt in to SMS notifications, your phone number is transmitted to Twilio to send you text messages.</li>
            </ul>
          </SubSection>
        </Section>

        <Section title="2. How We Use Your Information">
          <p className="text-gray-700 mb-3">We use the information we collect to:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
            <li>Provide, operate, and improve the Service.</li>
            <li>Authenticate your identity and maintain your account.</li>
            <li>Enable real-time video, audio, and screen-sharing sessions.</li>
            <li>Deliver chat messages and meeting notifications.</li>
            <li>Send SMS alerts if you have opted in to that feature.</li>
            <li>Generate meeting summaries, recordings (when enabled), and usage statistics shown in your dashboard.</li>
            <li>Respond to support requests and troubleshoot problems.</li>
            <li>Monitor for security threats, fraud, and abuse.</li>
            <li>Comply with legal obligations.</li>
          </ul>
          <p className="text-gray-700 mt-3">
            We do <strong>not</strong> use your data for advertising, sell it to third parties, or use
            meeting content (audio, video, chat) to train AI models.
          </p>
        </Section>

        <Section title="3. How We Share Your Information">
          <p className="text-gray-700 mb-3">
            We do not sell your personal information. We share it only in the following limited circumstances:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>
              <strong>With meeting participants:</strong> your display name, video, audio, and screen share are
              visible to other participants in meetings you join.
            </li>
            <li>
              <strong>Service providers:</strong> we share data with trusted third-party vendors (Clerk, LiveKit,
              Twilio) solely to provide the Service, under strict data processing agreements.
            </li>
            <li>
              <strong>Legal requirements:</strong> we may disclose information if required by law, court order,
              or governmental authority, or to protect our rights, users, or the public.
            </li>
            <li>
              <strong>Business transfers:</strong> if we are involved in a merger, acquisition, or asset sale,
              your information may be transferred as part of that transaction. We will notify you via email
              and/or a prominent notice before your data is subject to a different privacy policy.
            </li>
          </ul>
        </Section>

        <Section title="4. Recordings">
          <p className="text-gray-700 leading-relaxed">
            Meeting recordings are only created when the host explicitly starts recording. Participants are
            notified when a recording is in progress. Recordings are stored securely and are accessible only
            to the meeting host. Hosts can delete recordings at any time from the Recordings page. Recordings
            are automatically deleted after 90 days of inactivity.
          </p>
        </Section>

        <Section title="5. Data Retention">
          <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
            <li><strong>Account data:</strong> retained while your account is active and for 30 days after deletion.</li>
            <li><strong>Meeting metadata</strong> (title, time, participants): retained for 12 months.</li>
            <li><strong>Chat messages:</strong> retained for the duration of the meeting session and cleared after the meeting ends, unless the host has recording enabled.</li>
            <li><strong>Recordings:</strong> retained until deleted by the host or for 90 days after the meeting, whichever comes first.</li>
            <li><strong>Log data:</strong> retained for up to 90 days for security and debugging purposes.</li>
          </ul>
        </Section>

        <Section title="6. Data Security">
          <p className="text-gray-700 leading-relaxed">
            We implement industry-standard security measures to protect your information:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-gray-700 mt-3">
            <li>All data in transit is encrypted using TLS 1.2 or higher.</li>
            <li>Real-time audio and video streams are protected using DTLS-SRTP end-to-end encryption via LiveKit.</li>
            <li>Passwords are never stored in plain text — authentication is handled by Clerk using industry-standard hashing.</li>
            <li>Access to production systems is restricted to authorised personnel.</li>
            <li>We conduct periodic security reviews.</li>
          </ul>
          <p className="text-gray-700 mt-3">
            No method of transmission over the internet is 100% secure. While we strive to protect your
            data, we cannot guarantee absolute security.
          </p>
        </Section>

        <Section title="7. Your Rights and Choices">
          <p className="text-gray-700 mb-3">Depending on your location, you may have the right to:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
            <li><strong>Access</strong> the personal information we hold about you.</li>
            <li><strong>Correct</strong> inaccurate or incomplete information via your profile settings.</li>
            <li><strong>Delete</strong> your account and associated data by contacting us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a>.</li>
            <li><strong>Export</strong> your data in a portable format upon request.</li>
            <li><strong>Opt out</strong> of SMS notifications at any time by replying STOP to any message or updating your settings.</li>
            <li><strong>Object</strong> to or restrict certain types of processing.</li>
          </ul>
          <p className="text-gray-700 mt-3">
            To exercise any of these rights, please contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a>.
            We will respond within 30 days.
          </p>
        </Section>

        <Section title="8. Children's Privacy">
          <p className="text-gray-700 leading-relaxed">
            The Service is not directed to children under the age of 13 (or 16 in the European Economic
            Area). We do not knowingly collect personal information from children. If you believe a child
            has provided us with personal information, please contact us immediately at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a>{" "}
            and we will delete it promptly.
          </p>
        </Section>

        <Section title="9. International Data Transfers">
          <p className="text-gray-700 leading-relaxed">
            {COMPANY_NAME} is based in the United States. If you access the Service from outside the
            United States, your information may be transferred to, stored, and processed in the US or
            other countries where our service providers operate. We ensure appropriate safeguards are in
            place for such transfers, including standard contractual clauses where required by applicable law.
          </p>
        </Section>

        <Section title="10. Third-Party Links">
          <p className="text-gray-700 leading-relaxed">
            The Service may contain links to third-party websites or services. We are not responsible for
            the privacy practices of those third parties. We encourage you to review their privacy policies
            before providing any personal information.
          </p>
        </Section>

        <Section title="11. Cookies">
          <p className="text-gray-700 leading-relaxed">
            We use session cookies solely to keep you signed in and remember your preferences. We do not
            use advertising or tracking cookies. You can configure your browser to refuse cookies, but doing
            so may affect your ability to use certain features of the Service.
          </p>
        </Section>

        <Section title="12. Changes to This Privacy Policy">
          <p className="text-gray-700 leading-relaxed">
            We may update this Privacy Policy from time to time. When we do, we will update the "Last
            updated" date at the top and, for material changes, notify you by email or via a notice within
            the Service at least 14 days before the changes take effect. Your continued use of the Service
            after any changes constitutes your acceptance of the updated policy.
          </p>
        </Section>

        <Section title="13. Contact Us">
          <p className="text-gray-700 leading-relaxed mb-3">
            If you have any questions, concerns, or requests regarding this Privacy Policy or our data
            practices, please contact us:
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-1 text-gray-700">
            <p className="font-semibold">{COMPANY_NAME}</p>
            <p>Privacy inquiries: <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a></p>
            <p>Website: <a href={WEBSITE} className="text-blue-600 hover:underline">{WEBSITE}</a></p>
          </div>
        </Section>

        {/* Footer note */}
        <div className="border-t border-gray-200 pt-8 text-center text-sm text-gray-400">
          <p>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
          <p className="mt-1">This Privacy Policy was last updated on {LAST_UPDATED}.</p>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-gray-800 mb-2">{title}</h3>
      {children}
    </div>
  );
}
