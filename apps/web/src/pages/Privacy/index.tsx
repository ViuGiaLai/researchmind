import React from "react";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 space-y-4 text-slate-300">
      <h1 className="page-title">Privacy Policy</h1>
      <p className="page-subtitle">Summary of ResearchMind data boundaries</p>
      <p>Research libraries (PDFs, notes, chats, vectors) stay on your device by default.</p>
      <p>Cloud stores account identity, optional report payloads, backups you create, and device metadata.</p>
      <p>We do not silently migrate local research data to servers. Contact support@researchmind.app for deletion requests.</p>
    </div>
  );
}
