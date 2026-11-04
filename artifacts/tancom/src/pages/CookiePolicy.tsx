import { useLocation } from "wouter";
import { Cookie } from "lucide-react";

const LAST_UPDATED = "May 19, 2026";
const CONTACT_EMAIL = "privacy@tancom.us";
const APP_NAME = "TanCom";
const COMPANY_NAME = "TanCom, Inc.";
const WEBSITE = "https://tancom.us";

export default function CookiePolicyPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <div className="bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Cookie className="h-4 w-4 text-white" />
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Cookie Policy</h1>
          <p className="text-gray-500 text-sm">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">

        <section>
          <p className="text-gray-700 leading-relaxed">
            This Cookie Policy explains how {COMPANY_NAME} ("we," "us," or "our") uses cookies and
            similar technologies on the {APP_NAME} platform at{" "}
            <a href={WEBSITE} className="text-blue-600 hover:underline">{WEBSITE}</a> and in our
            applications. By using the Service you consent to our use of cookies as described here.
          </p>
        </section>

        <Section title="1. What Are Cookies?">
          <p className="text-gray-700 leading-relaxed">
            Cookies are small text files that a website stores on your device when you visit. They allow
            the site to recognise your browser on future visits, remember your preferences, and keep you
            signed in. Similar technologies include localStorage, sessionStorage, and IndexedDB, which
            we also use for local state storage.
          </p>
        </Section>

        <Section title="2. Cookies We Use">
          <p className="text-gray-700 mb-4">
            We use only the categories of cookies necessary to operate the Service. We do{" "}
            <strong>not</strong> use advertising or tracking cookies.
          </p>

          <div className="space-y-4">
            <CookieCategory
              name="Strictly Necessary"
              purpose="Required for the Service to function. These cannot be disabled."
              examples={[
                { name: "__session", desc: "Keeps you authenticated across page loads. Set by Clerk. Session duration." },
                { name: "__client_uat", desc: "Clerk client-side session token used for JWT verification. Session duration." },
                { name: "sidebar:state", desc: "Remembers whether your sidebar is expanded or collapsed. 7 days." },
              ]}
            />
            <CookieCategory
              name="Functional"
              purpose="Remember your preferences to improve your experience. Can be disabled in your browser."
              examples={[
                { name: "tancom_theme", desc: "Stores your light/dark mode preference. 365 days." },
                { name: "tancom_locale", desc: "Stores your language/locale setting. 365 days." },
              ]}
            />
            <CookieCategory
              name="Local Storage (not cookies)"
              purpose="Used by the browser application layer for performance caching and offline functionality."
              examples={[
                { name: "lk-*", desc: "LiveKit SDK local state for audio/video device preferences." },
                { name: "tancom-draft-*", desc: "Autosaved message drafts so you don't lose unsent text." },
              ]}
            />
          </div>
        </Section>

        <Section title="3. Third-Party Cookies">
          <p className="text-gray-700 leading-relaxed">
            Our authentication provider Clerk may set additional cookies on the{" "}
            <code className="bg-gray-100 px-1 rounded text-sm">clerk.tancom.us</code> subdomain
            as part of its authentication flow. These are strictly necessary for sign-in and session
            management. Refer to{" "}
            <a href="https://clerk.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Clerk's Privacy Policy
            </a>{" "}
            for details on their cookie usage.
          </p>
          <p className="text-gray-700 leading-relaxed mt-3">
            LiveKit, our real-time video infrastructure provider, does not set cookies in your browser.
            It communicates via WebRTC and WebSocket connections only.
          </p>
        </Section>

        <Section title="4. How to Control Cookies">
          <p className="text-gray-700 mb-3">
            You can control and manage cookies in several ways:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>
              <strong>Browser settings:</strong> Most browsers allow you to block or delete cookies.
              Note that blocking strictly necessary cookies will prevent you from signing in to the Service.
              See your browser's help documentation for instructions:
              <span className="block mt-1 space-x-3 text-sm">
                <a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Chrome</a>
                <a href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Firefox</a>
                <a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Safari</a>
                <a href="https://support.microsoft.com/en-us/windows/delete-and-manage-cookies-168dab11-0753-043d-7c16-ede5947fc64d" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Edge</a>
              </span>
            </li>
            <li>
              <strong>Device settings (mobile app):</strong> The {APP_NAME} mobile app uses tokens stored
              in secure device storage rather than cookies. You can clear app data through your device's
              application settings.
            </li>
          </ul>
        </Section>

        <Section title="5. Do Not Track">
          <p className="text-gray-700 leading-relaxed">
            Some browsers transmit a "Do Not Track" (DNT) signal. Because we do not use any tracking or
            advertising cookies, our behaviour does not change in response to DNT signals — we already
            collect only what is necessary to operate the Service.
          </p>
        </Section>

        <Section title="6. Changes to This Cookie Policy">
          <p className="text-gray-700 leading-relaxed">
            We may update this Cookie Policy when we change how we use cookies or adopt new technologies.
            The "Last updated" date at the top will reflect the latest revision. For material changes we
            will notify you via email or a notice within the Service.
          </p>
        </Section>

        <Section title="7. Contact Us">
          <p className="text-gray-700 mb-3">
            Questions about our use of cookies? Contact us:
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
          <p className="mt-1">This Cookie Policy was last updated on {LAST_UPDATED}.</p>
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

function CookieCategory({
  name,
  purpose,
  examples,
}: {
  name: string;
  purpose: string;
  examples: { name: string; desc: string }[];
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <p className="font-semibold text-gray-900 text-sm">{name}</p>
        <p className="text-gray-500 text-xs mt-0.5">{purpose}</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white border-b border-gray-100">
            <th className="text-left px-4 py-2 text-gray-500 font-medium w-40">Cookie / Key</th>
            <th className="text-left px-4 py-2 text-gray-500 font-medium">Purpose &amp; Duration</th>
          </tr>
        </thead>
        <tbody>
          {examples.map((ex, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
              <td className="px-4 py-2 font-mono text-xs text-gray-700 align-top">{ex.name}</td>
              <td className="px-4 py-2 text-gray-600">{ex.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
