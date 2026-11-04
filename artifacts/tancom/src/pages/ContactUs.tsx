import { useLocation } from "wouter";
import { Mail, MessageSquare, Phone, HelpCircle, Shield, FileText } from "lucide-react";

const APP_NAME = "TanCom";
const COMPANY_NAME = "TanCom, Inc.";
const SUPPORT_EMAIL = "support@tancom.us";
const PRIVACY_EMAIL = "privacy@tancom.us";
const LEGAL_EMAIL = "legal@tancom.us";
const WEBSITE = "https://tancom.us";

export default function ContactUsPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <div className="bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Mail className="h-4 w-4 text-white" />
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Contact Us</h1>
          <p className="text-gray-500 text-sm max-w-xl">
            We're here to help. Choose the right channel below and we'll get back to you as quickly as possible.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">

        {/* Contact cards */}
        <div className="grid gap-6 sm:grid-cols-2">
          <ContactCard
            icon={<HelpCircle className="h-5 w-5 text-blue-600" />}
            title="General Support"
            description="Account issues, billing questions, bugs, and anything else about using the platform."
            email={SUPPORT_EMAIL}
            responseTime="We aim to respond within 1 business day."
          />
          <ContactCard
            icon={<Shield className="h-5 w-5 text-blue-600" />}
            title="Privacy Inquiries"
            description="Data access requests, deletion requests, GDPR/CCPA inquiries, and privacy concerns."
            email={PRIVACY_EMAIL}
            responseTime="We respond to privacy requests within 30 days as required by law."
          />
          <ContactCard
            icon={<FileText className="h-5 w-5 text-blue-600" />}
            title="Legal &amp; Compliance"
            description="Intellectual property, law enforcement requests, contract questions, and Terms of Service matters."
            email={LEGAL_EMAIL}
            responseTime="We respond to legal matters within 5 business days."
          />
          <ContactCard
            icon={<MessageSquare className="h-5 w-5 text-blue-600" />}
            title="Business &amp; Partnerships"
            description="Enterprise plans, reseller opportunities, API access, and integration partnerships."
            email="business@tancom.us"
            responseTime="We respond to business inquiries within 2 business days."
          />
        </div>

        {/* In-app support */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Phone className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Already have an account?</h2>
              <p className="text-gray-600 text-sm mb-4">
                Signed-in users get faster support. Visit the Help &amp; Support section in the app for
                step-by-step guides, FAQs, and to submit a support ticket directly tied to your account.
              </p>
              <button
                onClick={() => setLocation("/user-manual")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Open Help Center
              </button>
            </div>
          </div>
        </div>

        {/* Response times */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
            What to Include in Your Email
          </h2>
          <p className="text-gray-700 mb-4">
            To help us resolve your issue as quickly as possible, please include:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>Your account email address (the one you used to sign up).</li>
            <li>A clear description of the issue or question.</li>
            <li>Steps to reproduce the problem, if applicable.</li>
            <li>Your device, browser, or app version (e.g. iOS 17, Chrome 124, {APP_NAME} v2.1).</li>
            <li>Any error messages or screenshots that may help us investigate.</li>
          </ul>
        </section>

        {/* Company info */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
            Company Information
          </h2>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-2 text-gray-700">
            <p className="font-semibold text-gray-900">{COMPANY_NAME}</p>
            <p>Website: <a href={WEBSITE} className="text-blue-600 hover:underline">{WEBSITE}</a></p>
            <p>General support: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">{SUPPORT_EMAIL}</a></p>
          </div>
        </section>

        {/* Footer note */}
        <div className="border-t border-gray-200 pt-8 text-center text-sm text-gray-400">
          <p>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ContactCard({
  icon,
  title,
  description,
  email,
  responseTime,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  email: string;
  responseTime: string;
}) {
  return (
    <div className="border border-gray-200 rounded-2xl p-5 flex flex-col gap-3 hover:border-blue-200 hover:shadow-sm transition-all">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">{icon}</div>
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
      <p className="text-gray-600 text-sm leading-relaxed flex-1">{description}</p>
      <a
        href={`mailto:${email}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
      >
        <Mail className="h-3.5 w-3.5" />
        {email}
      </a>
      <p className="text-xs text-gray-400">{responseTime}</p>
    </div>
  );
}
