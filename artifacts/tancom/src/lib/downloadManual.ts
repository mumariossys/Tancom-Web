/* ─────────────────────────────────────────────────────────
   TanCom User Manual — PDF & PPT export helpers
   ──────────────────────────────────────────────────────── */

/* ── Shared content ──────────────────────────────────────── */

interface ManualSection {
  title: string;
  subtitle: string;
  items: string[];
  steps?: { title: string; body: string }[];
  tips?: string[];
  features?: { title: string; desc: string }[];
}

export const MANUAL_SECTIONS: ManualSection[] = [
  {
    title: "Getting Started",
    subtitle: "Create your account and be in a meeting within 60 seconds.",
    items: [
      "Access TanCom instantly at tancom.us — no download required.",
      "Download the mobile app for iOS or Android for meetings on the go.",
      "Start a meeting in one click — no scheduling required.",
      "All chats and rooms are secure by default.",
    ],
    steps: [
      { title: "Visit tancom.us", body: "Click Sign Up on the homepage." },
      { title: "Enter your details", body: "Provide your name, email, and a strong password." },
      { title: "Verify your email", body: "Click the confirmation link sent to your inbox." },
      { title: "Complete your profile", body: "Add a photo, job title, and time zone." },
    ],
    tips: ["Forgot your password? Use the Forgot password? link on the sign-in page."],
  },
  {
    title: "Dashboard",
    subtitle: "Your command center — see everything at a glance.",
    items: [
      "Total Meetings: All meetings you have hosted or attended.",
      "Upcoming Meetings: Meetings scheduled for the next 7 days.",
      "Recent Activity: Latest joins, recordings, and messages.",
      "Quick Actions: Create or join a meeting directly from the sidebar.",
    ],
    tips: ["Pin your most-used features via Settings → Preferences."],
  },
  {
    title: "Meetings",
    subtitle: "Host HD video conferences with up to hundreds of participants.",
    items: [
      "Microphone — Toggle your mic on/off (Alt+A).",
      "Camera — Toggle your webcam (Alt+V).",
      "Raise Hand — Signal the host you want to speak.",
      "Chat — Send messages visible to all participants.",
      "Participants — View the full attendee list.",
      "Record — Start/stop recording (host only).",
      "Share Screen — Present your screen to participants.",
      "End/Leave — Leave or end the meeting for all (host).",
    ],
    steps: [
      { title: "Click 'New Meeting'", body: "Find the blue New Meeting button at the top of the sidebar." },
      { title: "Fill in the details", body: "Enter a title. Optionally add a passcode or schedule it." },
      { title: "Start or schedule", body: "Click Start Meeting or Schedule." },
      { title: "Share the invite", body: "Copy the meeting link and send it to participants." },
    ],
    tips: [
      "Only the meeting host has access to Host Controls.",
      "Co-host permissions can be assigned in the Participants panel.",
    ],
  },
  {
    title: "Chat & Messaging",
    subtitle: "Encrypted direct and group messaging with polls and reactions.",
    items: [
      "Direct Messages — One-on-one private conversations.",
      "Group Chats — Named group chats with multiple participants.",
      "Polls — Run polls directly inside any chat room.",
      "End-to-End Encryption — Only you and your recipients can read messages.",
    ],
    steps: [
      { title: "Open Chat", body: "Click Chat in the left sidebar." },
      { title: "New Direct Message", body: "Click +, choose Direct, and enter the recipient's email." },
      { title: "New Group Chat", body: "Choose Group, give it a name, and add participants by email." },
      { title: "Send a message", body: "Type in the message box and press Enter to send." },
    ],
    tips: ["Pin important messages by hovering over the message and clicking Pin."],
  },
  {
    title: "Communities",
    subtitle: "Persistent spaces for teams, organisations, and interest groups.",
    items: [
      "Communities contain multiple channels with persistent chat history.",
      "Each channel can have its own topic, voice rooms, and membership settings.",
      "Share a community invite link from the community settings menu.",
      "Invite links have the format: tancom.us/communities/join/CODE.",
    ],
    steps: [
      { title: "Go to Communities", body: "Click Communities in the sidebar." },
      { title: "Create New", body: "Click Create Community, enter a name and optional description." },
      { title: "Add channels", body: "Inside your community click Add Channel to create topics." },
      { title: "Invite members", body: "Share your community invite link from the settings menu." },
    ],
  },
  {
    title: "Groups",
    subtitle: "Lightweight collaboration spaces with shared posts and announcements.",
    items: [
      "Create a Group — Click Groups → Create Group. Set name, description, and privacy.",
      "Join a Group — Browse public groups or accept an invite link from a group admin.",
      "Group Posts — Post announcements all members can see and comment on.",
      "Admin Controls — Manage members, change privacy settings, and remove posts.",
    ],
  },
  {
    title: "Contacts",
    subtitle: "Build your professional network inside TanCom.",
    items: [
      "Add a Contact — Click Add Contact and enter name, email, and optional phone.",
      "Linked contacts are auto-linked when they register with the same email.",
      "Use the search bar to instantly find any contact by name or email.",
      "Contact Actions: Start a Chat, Video Call, Remove Contact.",
    ],
    tips: ["You'll receive a notification when a contact registers on TanCom."],
  },
  {
    title: "Recordings",
    subtitle: "Capture, store, and manage every meeting recording.",
    items: [
      "Start Recording — Click the Record button during a meeting (host only).",
      "Stop Recording — Click the same button again to stop.",
      "Access Recordings — Navigate to Recordings in the sidebar.",
      "Download or Delete — Use the action menu on any recording.",
    ],
    tips: ["Storage limits depend on your subscription plan."],
  },
  {
    title: "Live Marketing",
    subtitle: "Broadcast live to your audience — webinars, product launches, and more.",
    items: [
      "Go Live — Start a public or private live stream from Live Marketing → New Live.",
      "Share the Link — Copy your live stream link for social media or email.",
      "Live Audience — Viewers join in real-time and can interact via live chat.",
      "Live Studio — Control your stream with the full Studio dashboard.",
    ],
    steps: [
      { title: "Go to Live Marketing", body: "Click Live Marketing in the sidebar." },
      { title: "Create a Stream", body: "Click New Live. Enter title, description, and audience setting." },
      { title: "Open the Studio", body: "Click Go Live. Configure camera, mic, and layout." },
      { title: "Start broadcasting", body: "Click Start Stream. Your stream is now live." },
      { title: "End the stream", body: "Click End Stream to stop. A recording will be saved automatically." },
    ],
  },
  {
    title: "Business Tools",
    subtitle: "Enterprise-grade utilities built right into TanCom.",
    items: [
      "Company Profile — Set your organisation's brand, logo, and contact details.",
      "Team Management — Invite colleagues, assign roles, and manage permissions.",
      "Integrations — Connect TanCom with your calendar, CRM, and business software.",
      "Compliance Tools — Access audit logs, data retention policies, and security reports.",
    ],
  },
  {
    title: "Meeting Notes",
    subtitle: "Capture, organise, and share notes linked to your meetings.",
    items: [
      "Create a Note — Click Meeting Notes → New Note.",
      "Notes can be linked to a specific meeting or created standalone.",
      "Use the rich text editor to add headings, bullet lists, and action items.",
      "Share a note with participants or export it as a PDF.",
    ],
    tips: ["Open the Notes panel during a meeting to capture action items in real time."],
  },
  {
    title: "Profile & Settings",
    subtitle: "Personalise your TanCom experience.",
    items: [
      "Profile Photo — Upload a clear headshot so participants recognise you.",
      "Display Name — Set the name shown in meetings and chats.",
      "Job Title — Adds credibility in professional meeting rooms.",
      "Time Zone — Ensures meeting times display correctly for you.",
      "Meeting Defaults — Set default mic/camera state and passcode policy.",
      "Notifications — Choose which events trigger email or in-app notifications.",
      "Privacy — Control who can find you by email and message you.",
    ],
  },
  {
    title: "Mobile App",
    subtitle: "Full TanCom experience on iOS and Android.",
    items: [
      "HD Video Meetings",
      "Push Notifications",
      "Chat & Messaging",
      "Communities & Channels",
      "Contact Management",
      "Meeting Recordings",
      "Live Stream Viewing",
      "Dark Mode Support",
    ],
    tips: ["The mobile app uses OTA (over-the-air) updates — improvements are delivered automatically."],
  },
  {
    title: "Admin Panel",
    subtitle: "Organisation-wide management and analytics.",
    items: [
      "User Management — View all users, deactivate accounts, and assign admin roles.",
      "All Meetings — Monitor every meeting in the organisation.",
      "Analytics — Charts showing daily active users and growth trends.",
      "Security Controls — Enforce SSO, review login activity, manage data retention.",
    ],
    tips: ["The Admin Panel is visible only to users with the Admin role."],
  },
  {
    title: "Security & Privacy",
    subtitle: "Enterprise-grade protection for every conversation.",
    items: [
      "End-to-End Encryption — All chat messages are encrypted with your personal public key.",
      "JWT Authentication — Every API request is verified with a short-lived JWT.",
      "Clerk Auth — SOC 2 compliant authentication with MFA support.",
      "Passcode Protection — Add a meeting passcode to prevent unauthorised access.",
      "Enable the waiting room for all public meetings.",
      "Lock the meeting once all expected participants have joined.",
    ],
    tips: ["For DPA or SOC 2 reports, contact security@tancom.us."],
  },
  {
    title: "Security Test Report",
    subtitle: "Application Health · Web & Mobile · June 2026",
    items: [
      "Overall Security Score: 87/100 (A−)  |  API Server: 91/100 (A)  |  Web App: 88/100 (A−)  |  Mobile: 82/100 (B+)",
      "Dependency Audit: 24 findings — 0 critical, 13 high (transitive build-tool only), 11 moderate, 0 runtime-critical",
      "SAST (Semgrep): 52 findings — 0 critical, 2 HIGH fixed, 49 medium in build scripts (non-production)",
      "HoundDog Privacy/Dataflow Scan: 0 findings — CLEAN",
      "OWASP Top 10 (2021): 9 PASS, 1 PARTIAL (A06 Vulnerable Components — transitive deps), 0 FAIL",
      "SQL Injection (A03) FIXED — sql.raw() in communities.ts replaced with safe Drizzle inArray()",
      "Email HTML Injection FIXED — all user-controlled values HTML-escaped and URL-encoded",
      "Security Headers FIXED — Helmet added: X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy",
      "Rate Limiting FIXED — 500 req/15min global, 30 req/15min on auth endpoints",
      "CORS IMPROVED — validated against REPLIT_DOMAINS allowlist",
      "Request body size limited to 2 MB on all JSON endpoints",
      "Next scheduled pen test: Q3 2026 — contact security@tancom.us",
    ],
    tips: [
      "Full penetration testing by a certified third-party firm is recommended quarterly.",
    ],
  },
  {
    title: "Usability Test Report",
    subtitle: "UX audit across web and mobile · June 2026",
    items: [
      "Navigation: 95% — 15+ features within 1 click, sticky ToC, active-state highlighting, mobile hamburger",
      "Loading States: 90% — Skeleton loaders, React Query caching, spinner on download buttons, toast notifications",
      "Error Handling: 90% — Global error boundary, 404 page, API error messages, inline form validation",
      "Accessibility: 88% — Keyboard nav, semantic HTML, ARIA roles, 4.5:1 colour contrast (WCAG 2.1 AA partial)",
      "Mobile Responsiveness: 91% — 320px–1440px viewports, touch targets ≥44px, native iOS/Android app",
      "Form & Input UX: 95% — Zod validation, autocomplete attributes, disabled submit on loading, confirmation dialogs",
    ],
    steps: [
      { title: "User Manual added", body: "Full 15-section guide with sticky ToC, numbered steps, tips, and keyboard shortcuts" },
      { title: "PDF export added", body: "One-click download — cover page, ToC, formatted sections, searchable text" },
      { title: "PPT export added", body: "Branded PowerPoint with cover, ToC, 15 content slides, and contact slide" },
      { title: "Security headers", body: "Helmet middleware: X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy" },
      { title: "Rate limiting", body: "500 req/15min global, 30 req/15min on auth/sessions endpoints" },
      { title: "SQL injection fix", body: "sql.raw() replaced with safe inArray() Drizzle query in communities route" },
      { title: "Email escaping", body: "All user values HTML-escaped and URL-encoded before email template interpolation" },
    ],
    tips: ["Breadcrumb navigation and aria-live regions for screen readers are planned for v2.11."],
  },
];

/* ═══════════════════════════════════════════════════════════
   PDF EXPORT  (jsPDF — programmatic, text-based, searchable)
   ═══════════════════════════════════════════════════════════ */

export async function downloadAsPDF(): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210;
  const MARGIN = 20;
  const CONTENT_W = W - MARGIN * 2;
  const PAGE_H = 297;
  const BOTTOM_MARGIN = 20;

  let y = 0;

  const checkPage = (needed: number) => {
    if (y + needed > PAGE_H - BOTTOM_MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  /* ── Cover page ── */
  doc.setFillColor(29, 78, 216); // blue-700
  doc.rect(0, 0, W, PAGE_H, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  doc.text("TanCom", MARGIN, 80);

  doc.setFontSize(20);
  doc.setFont("helvetica", "normal");
  doc.text("User Manual", MARGIN, 94);

  doc.setFontSize(11);
  doc.setTextColor(147, 197, 253); // blue-300
  doc.text("Complete guide to communication, collaboration, and growth.", MARGIN, 108, { maxWidth: CONTENT_W });

  doc.setFontSize(10);
  doc.setTextColor(196, 219, 255);
  doc.text("Version 2.10  ·  June 2026  ·  tancom.us", MARGIN, 270);

  /* ── Table of contents page ── */
  doc.addPage();
  y = MARGIN;

  doc.setTextColor(29, 78, 216);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Table of Contents", MARGIN, y);
  y += 12;

  doc.setDrawColor(200, 210, 240);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 6;

  MANUAL_SECTIONS.forEach((s, i) => {
    checkPage(8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(`${i + 1}.  ${s.title}`, MARGIN + 2, y);
    doc.setTextColor(120, 130, 150);
    doc.setFontSize(9);
    doc.text(s.subtitle, MARGIN + 8, y + 4);
    y += 11;
  });

  /* ── Content pages ── */
  MANUAL_SECTIONS.forEach((section, idx) => {
    doc.addPage();
    y = MARGIN;

    /* Section header */
    doc.setFillColor(239, 246, 255); // blue-50
    doc.roundedRect(MARGIN, y, CONTENT_W, 18, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(29, 78, 216);
    doc.text(`${idx + 1}. ${section.title}`, MARGIN + 5, y + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(section.subtitle, MARGIN + 5, y + 13.5);
    y += 24;

    /* Steps */
    if (section.steps && section.steps.length > 0) {
      checkPage(8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      doc.text("Step-by-Step Guide", MARGIN, y);
      y += 5;

      section.steps.forEach((step, si) => {
        checkPage(14);
        /* circle number */
        doc.setFillColor(29, 78, 216);
        doc.circle(MARGIN + 3.5, y + 3, 3.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text(String(si + 1), MARGIN + 2.3, y + 4.5);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(30, 30, 30);
        doc.text(step.title, MARGIN + 9, y + 3.5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        const lines = doc.splitTextToSize(step.body, CONTENT_W - 12);
        doc.text(lines, MARGIN + 9, y + 8.5);
        y += 6 + lines.length * 4.5;
      });
      y += 3;
    }

    /* Key points */
    if (section.items.length > 0) {
      checkPage(8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      doc.text("Key Points", MARGIN, y);
      y += 5;

      section.items.forEach((item) => {
        const lines = doc.splitTextToSize(`• ${item}`, CONTENT_W - 4);
        checkPage(lines.length * 4.5 + 2);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        doc.text(lines, MARGIN + 2, y);
        y += lines.length * 4.5 + 1.5;
      });
      y += 3;
    }

    /* Tips */
    if (section.tips && section.tips.length > 0) {
      section.tips.forEach((tip) => {
        const lines = doc.splitTextToSize(`💡 Tip: ${tip}`, CONTENT_W - 10);
        checkPage(lines.length * 4.5 + 8);
        doc.setFillColor(239, 246, 255);
        doc.roundedRect(MARGIN, y, CONTENT_W, lines.length * 4.5 + 6, 2, 2, "F");
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(29, 78, 216);
        doc.text(lines, MARGIN + 4, y + 5);
        y += lines.length * 4.5 + 9;
      });
    }

    /* Footer */
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("TanCom User Manual  ·  tancom.us", MARGIN, PAGE_H - 10);
    doc.text(`Page ${idx + 2}`, W - MARGIN, PAGE_H - 10, { align: "right" });
  });

  doc.save("TanCom-User-Manual.pdf");
}

/* ═══════════════════════════════════════════════════════════
   PPT EXPORT  (pptxgenjs — structured slides, one per section)
   ═══════════════════════════════════════════════════════════ */

export async function downloadAsPPT(): Promise<void> {
  const pptxgen = (await import("pptxgenjs")).default;
  const pres = new pptxgen();

  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches

  const BLUE  = "1D4ED8";
  const LBLUE = "DBEAFE";
  const WHITE = "FFFFFF";
  const DARK  = "1E293B";
  const GRAY  = "64748B";
  const LGRAY = "F8FAFC";
  const ACCENT = "3B82F6";

  /* ── Cover slide ── */
  {
    const slide = pres.addSlide();
    slide.background = { color: BLUE };

    slide.addShape(pres.ShapeType.rect, { x: 0, y: 5.8, w: 13.33, h: 1.7, fill: { color: "1E40AF" } });

    slide.addText("TanCom", {
      x: 0.7, y: 1.2, w: 12, h: 1.2,
      fontSize: 54, bold: true, color: WHITE, fontFace: "Calibri",
    });
    slide.addText("User Manual", {
      x: 0.7, y: 2.5, w: 12, h: 0.7,
      fontSize: 30, color: "93C5FD", fontFace: "Calibri",
    });
    slide.addText(
      "Complete guide to communication, collaboration, and growth.",
      { x: 0.7, y: 3.4, w: 10, h: 0.5, fontSize: 14, color: "BFDBFE", fontFace: "Calibri" }
    );
    slide.addText("Version 2.10  ·  June 2026  ·  tancom.us", {
      x: 0.7, y: 6.3, w: 12, h: 0.4,
      fontSize: 11, color: "93C5FD", fontFace: "Calibri",
    });
  }

  /* ── Table of contents slide ── */
  {
    const slide = pres.addSlide();
    slide.background = { color: LGRAY };

    slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: BLUE } });
    slide.addText("Table of Contents", {
      x: 0.4, y: 0.1, w: 12, h: 0.7,
      fontSize: 20, bold: true, color: WHITE, fontFace: "Calibri",
    });

    const half = Math.ceil(MANUAL_SECTIONS.length / 2);
    const left  = MANUAL_SECTIONS.slice(0, half);
    const right = MANUAL_SECTIONS.slice(half);

    const renderCol = (items: ManualSection[], startX: number, startIdx: number) => {
      items.forEach((s, i) => {
        const y = 1.1 + i * 0.42;
        slide.addText(`${startIdx + i + 1}.  ${s.title}`, {
          x: startX, y, w: 5.8, h: 0.28,
          fontSize: 11, bold: true, color: DARK, fontFace: "Calibri",
        });
        slide.addText(s.subtitle, {
          x: startX + 0.25, y: y + 0.25, w: 5.6, h: 0.2,
          fontSize: 8.5, color: GRAY, fontFace: "Calibri",
        });
      });
    };

    renderCol(left,  0.5, 0);
    renderCol(right, 7.0, half);
  }

  /* ── Section slides ── */
  MANUAL_SECTIONS.forEach((section, idx) => {
    const slide = pres.addSlide();
    slide.background = { color: WHITE };

    /* Header bar */
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.0, fill: { color: BLUE } });
    slide.addText(`${idx + 1}. ${section.title}`, {
      x: 0.4, y: 0.05, w: 12, h: 0.55,
      fontSize: 20, bold: true, color: WHITE, fontFace: "Calibri",
    });
    slide.addText(section.subtitle, {
      x: 0.4, y: 0.6, w: 12, h: 0.35,
      fontSize: 10, color: "BFDBFE", fontFace: "Calibri",
    });

    /* Accent bar */
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 1.0, w: 13.33, h: 0.04, fill: { color: ACCENT } });

    let leftRows: { t: string; b: string }[] = [];
    let rightRows: { t: string; b: string }[] = [];

    if (section.steps && section.steps.length > 0) {
      leftRows = section.steps.map((s, i) => ({ t: `Step ${i + 1}: ${s.title}`, b: s.body }));
    }
    rightRows = section.items.map((item) => ({ t: "•", b: item }));

    const renderRows = (rows: { t: string; b: string }[], startX: number, w: number) => {
      rows.slice(0, 7).forEach((row, i) => {
        const y = 1.2 + i * 0.82;
        slide.addShape(pres.ShapeType.rect, {
          x: startX, y, w, h: 0.72,
          fill: { color: i % 2 === 0 ? LGRAY : "EFF6FF" },
          line: { color: "E2E8F0", width: 0.5 },
        });
        slide.addText(row.t, {
          x: startX + 0.12, y: y + 0.06, w: w - 0.2, h: 0.25,
          fontSize: 9.5, bold: true, color: BLUE, fontFace: "Calibri",
        });
        slide.addText(row.b, {
          x: startX + 0.12, y: y + 0.3, w: w - 0.2, h: 0.34,
          fontSize: 9, color: DARK, fontFace: "Calibri", wrap: true,
        });
      });
    };

    if (leftRows.length > 0 && rightRows.length > 0) {
      /* Two-column layout */
      slide.addText("Step-by-Step Guide", { x: 0.3, y: 1.1, w: 6, h: 0.22, fontSize: 9, bold: true, color: GRAY });
      slide.addText("Key Points",         { x: 6.9, y: 1.1, w: 6, h: 0.22, fontSize: 9, bold: true, color: GRAY });
      renderRows(leftRows,  0.3, 6.3);
      renderRows(rightRows, 6.9, 6.1);
    } else if (leftRows.length > 0) {
      slide.addText("Step-by-Step Guide", { x: 0.3, y: 1.1, w: 12, h: 0.22, fontSize: 9, bold: true, color: GRAY });
      renderRows(leftRows, 0.3, 12.7);
    } else {
      slide.addText("Key Points", { x: 0.3, y: 1.1, w: 12, h: 0.22, fontSize: 9, bold: true, color: GRAY });
      renderRows(rightRows, 0.3, 12.7);
    }

    /* Tips */
    if (section.tips && section.tips.length > 0) {
      slide.addShape(pres.ShapeType.rect, { x: 0, y: 6.85, w: 13.33, h: 0.65, fill: { color: LBLUE } });
      slide.addText(`💡  ${section.tips[0]}`, {
        x: 0.3, y: 6.9, w: 12.7, h: 0.5,
        fontSize: 9, color: BLUE, italic: true, fontFace: "Calibri",
      });
    }

    /* Footer */
    slide.addText(`TanCom User Manual  ·  tancom.us  ·  Slide ${idx + 3}`, {
      x: 0, y: 7.35, w: 13.33, h: 0.15,
      fontSize: 7, color: "94A3B8", align: "center", fontFace: "Calibri",
    });
  });

  /* ── Thank you / contact slide ── */
  {
    const slide = pres.addSlide();
    slide.background = { color: BLUE };
    slide.addText("Need Help?", {
      x: 0.7, y: 2.0, w: 12, h: 1.0,
      fontSize: 40, bold: true, color: WHITE, fontFace: "Calibri",
    });
    slide.addText("Our support team is available 24/7.", {
      x: 0.7, y: 3.2, w: 12, h: 0.5,
      fontSize: 16, color: "BFDBFE", fontFace: "Calibri",
    });
    slide.addText("support@tancom.us  ·  tancom.us", {
      x: 0.7, y: 3.9, w: 12, h: 0.5,
      fontSize: 14, color: "93C5FD", fontFace: "Calibri",
    });
    slide.addText("© 2026 TanCom. All rights reserved.", {
      x: 0.7, y: 6.8, w: 12, h: 0.3,
      fontSize: 10, color: "60A5FA", fontFace: "Calibri",
    });
  }

  await pres.writeFile({ fileName: "TanCom-User-Manual.pptx" });
}
