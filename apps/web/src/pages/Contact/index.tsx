import React, { useState } from "react";
import { Button, Input } from "@researchmind/ui";
import { APP_CONFIG } from "@researchmind/config";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="page-title">Contact</h1>
      <p className="page-subtitle">Reach us at {APP_CONFIG.supportEmail}</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
        }}
      >
        <Input label="Name" name="name" required />
        <Input label="Email" type="email" name="email" required />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-slate-300">Message</span>
          <textarea className="min-h-[120px] rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-100 outline-none focus:border-sky-500" required />
        </label>
        {sent ? <p className="text-sm text-emerald-400">Thanks — message captured locally (wire email provider later).</p> : null}
        <Button type="submit">Send message</Button>
      </form>
    </div>
  );
}
