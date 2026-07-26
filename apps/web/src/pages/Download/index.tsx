import React from "react";
import { Button, Card, CardContent } from "@researchmind/ui";
import { desktopDownloadUrl } from "@/utils/urls";
import { Monitor, Apple, Terminal } from "lucide-react";

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="page-title">Download ResearchMind Desktop</h1>
      <p className="page-subtitle">The research IDE runs on your machine. Cloud complements it — it does not replace it.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          { icon: Monitor, name: "Windows", desc: "Installer + portable" },
          { icon: Apple, name: "macOS", desc: "Apple Silicon & Intel" },
          { icon: Terminal, name: "Linux", desc: "AppImage / deb" },
        ].map((p) => (
          <Card key={p.name}>
            <CardContent className="space-y-3">
              <p.icon className="h-6 w-6 text-sky-400" />
              <h3 className="font-semibold text-slate-50">{p.name}</h3>
              <p className="text-sm text-slate-400">{p.desc}</p>
              <a href={desktopDownloadUrl()} target="_blank" rel="noreferrer">
                <Button className="w-full">Download</Button>
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
