import { defineManifest } from "@crxjs/vite-plugin";

// Spike build. Two content scripts:
//  - inject.ts runs in the page's MAIN world at document_start so it can
//    monkeypatch the real window.fetch / XHR before Gmail uses them.
//  - content.ts runs in the ISOLATED world, has chrome APIs, and correlates
//    the interceptor's reports with open state.
export default defineManifest({
  manifest_version: 3,
  name: "MailSuiteKiller (spike)",
  version: "0.0.1",
  description: "Detects email tracking pixels in Gmail and warns before you open a tracked email.",
  permissions: ["storage"],
  host_permissions: ["https://mail.google.com/*"],
  action: {
    default_popup: "src/popup/popup.html",
    default_title: "MailSuiteKiller",
  },
  content_scripts: [
    {
      matches: ["https://mail.google.com/*"],
      js: ["src/gmail/inject.ts"],
      run_at: "document_start",
      world: "MAIN",
    },
    {
      matches: ["https://mail.google.com/*"],
      js: ["src/gmail/content.ts"],
      run_at: "document_start",
    },
  ],
});
