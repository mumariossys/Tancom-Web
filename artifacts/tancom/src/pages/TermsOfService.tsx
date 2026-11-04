import { useLocation } from "wouter";
import { FileText } from "lucide-react";

const LAST_UPDATED = "May 19, 2026";
const CONTACT_EMAIL = "legal@tancom.us";
const APP_NAME = "TanCom";
const COMPANY_NAME = "TanCom, Inc.";
const WEBSITE = "https://tancom.us";

export default function TermsOfServicePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <div className="bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <FileText className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
          </div>
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors"
          >
            ← Back to {APP_NAME}
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-gray-500 text-sm">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">

        <section>
          <p className="text-gray-700 leading-relaxed">
            Please read these Terms of Service ("Terms") carefully before using {APP_NAME}, operated by{" "}
            {COMPANY_NAME} ("we," "us," or "our"). By accessing or using the Service you agree to be bound
            by these Terms. If you do not agree, do not use the Service.
          </p>
        </section>

        <Section title="1. Eligibility">
          <p className="text-gray-700 leading-relaxed">
            You must be at least 13 years old (or 16 in the European Economic Area) to use the Service.
            By agreeing to these Terms you represent that you meet this requirement. If you are using the
            Service on behalf of a business or organisation, you represent that you have authority to bind
            that entity to these Terms.
          </p>
        </Section>

        <Section title="2. Your Account">
          <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
            <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
            <li>You must provide accurate, current, and complete information when creating your account.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>You must notify us immediately at <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a> if you suspect any unauthorised use of your account.</li>
            <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
          </ul>
        </Section>

        <Section title="3. Acceptable Use">
          <p className="text-gray-700 mb-3">You agree not to use the Service to:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
            <li>Violate any applicable law or regulation.</li>
            <li>Harass, abuse, threaten, defame, or discriminate against any person.</li>
            <li>Transmit spam, unsolicited messages, or deceptive communications.</li>
            <li>Record meetings without the knowledge and consent of all participants where required by law.</li>
            <li>Distribute malware, viruses, or any other malicious code.</li>
            <li>Attempt to gain unauthorised access to our systems or another user's account.</li>
            <li>Reverse-engineer, decompile, or disassemble any part of the Service.</li>
            <li>Use the Service to compete with us or build a substantially similar product.</li>
            <li>Exceed any rate limits or otherwise overload our infrastructure.</li>
          </ul>
        </Section>

        <Section title="4. Meetings and Recordings">
          <ul className="list-disc pl-5 space-y-1.5 text-gray-700">
            <li>Meeting hosts are solely responsible for obtaining any consents required by applicable law before recording a meeting.</li>
            <li>All participants are notified within the {APP_NAME} interface when a recording is in progress.</li>
            <li>Recordings are stored for up to 90 days and are the responsibility of the host. We are not liable for unauthorised disclosure of recordings by meeting hosts.</li>
            <li>We reserve the right to remove content that violates these Terms or applicable law.</li>
          </ul>
        </Section>

        <Section title="5. Intellectual Property">
          <p className="text-gray-700 leading-relaxed">
            The Service, including its design, software, trademarks, and content created by us, is owned
            by {COMPANY_NAME} and protected by intellectual property laws. You are granted a limited,
            non-exclusive, non-transferable licence to access and use the Service for its intended purpose.
            You retain ownership of any content you create or share through the Service.
          </p>
        </Section>

        <Section title="6. User Content">
          <p className="text-gray-700 leading-relaxed">
            By submitting content (messages, recordings, profile information) through the Service, you grant
            us a limited licence to store, process, and transmit that content solely to provide the Service.
            We do not claim ownership of your content, and we do not use it to train AI models or for
            advertising purposes.
          </p>
        </Section>

        <Section title="7. Third-Party Services">
          <p className="text-gray-700 leading-relaxed">
            The Service relies on third-party providers including Clerk (authentication), LiveKit
            (real-time video/audio infrastructure), and Twilio (SMS notifications). Your use of these
            components is also subject to those providers' terms of service. We are not responsible for
            the availability or conduct of third-party services.
          </p>
        </Section>

        <Section title="8. Fees and Payment">
          <p className="text-gray-700 leading-relaxed">
            Certain features of the Service may be offered on a paid subscription basis. Pricing, billing
            cycles, and cancellation terms will be presented to you before any purchase. All fees are
            non-refundable except as required by applicable law or as expressly stated at the time of
            purchase.
          </p>
        </Section>

        <Section title="9. Disclaimer of Warranties">
          <p className="text-gray-700 leading-relaxed">
            The Service is provided "as is" and "as available" without warranties of any kind, express or
            implied, including but not limited to implied warranties of merchantability, fitness for a
            particular purpose, and non-infringement. We do not warrant that the Service will be
            uninterrupted, error-free, or completely secure.
          </p>
        </Section>

        <Section title="10. Limitation of Liability">
          <p className="text-gray-700 leading-relaxed">
            To the maximum extent permitted by applicable law, {COMPANY_NAME} shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages arising out of or related to
            your use of the Service. Our total aggregate liability for any claim shall not exceed the
            greater of $100 USD or the amounts you paid us in the 12 months preceding the claim.
          </p>
        </Section>

        <Section title="11. Indemnification">
          <p className="text-gray-700 leading-relaxed">
            You agree to indemnify and hold harmless {COMPANY_NAME} and its officers, directors, employees,
            and agents from any claims, damages, or expenses (including reasonable legal fees) arising from
            your use of the Service, your violation of these Terms, or your violation of any rights of a
            third party.
          </p>
        </Section>

        <Section title="12. Termination">
          <p className="text-gray-700 leading-relaxed">
            Either party may terminate the agreement formed by these Terms at any time. You may close your
            account from the Settings page. We may suspend or terminate your access immediately if we
            determine you have violated these Terms, with or without prior notice. Upon termination, your
            right to use the Service ceases immediately.
          </p>
        </Section>

        <Section title="13. Governing Law">
          <p className="text-gray-700 leading-relaxed">
            These Terms are governed by the laws of the State of Delaware, United States, without regard
            to conflict-of-law principles. Any disputes arising under these Terms shall be subject to the
            exclusive jurisdiction of the courts located in Delaware.
          </p>
        </Section>

        <Section title="14. Changes to These Terms">
          <p className="text-gray-700 leading-relaxed">
            We may modify these Terms from time to time. We will notify you of material changes by email
            or via a notice in the Service at least 14 days before they take effect. Your continued use
            of the Service after changes become effective constitutes acceptance of the revised Terms.
          </p>
        </Section>

        <Section title="15. Contact Us">
          <p className="text-gray-700 mb-3">
            If you have any questions about these Terms, please contact us:
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-1 text-gray-700">
            <p className="font-semibold">{COMPANY_NAME}</p>
            <p>Legal inquiries: <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">{CONTACT_EMAIL}</a></p>
            <p>Website: <a href={WEBSITE} className="text-blue-600 hover:underline">{WEBSITE}</a></p>
          </div>
        </Section>

        {/* Footer note */}
        <div className="border-t border-gray-200 pt-8 text-center text-sm text-gray-400">
          <p>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
          <p className="mt-1">These Terms were last updated on {LAST_UPDATED}.</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
