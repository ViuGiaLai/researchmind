import React from "react";
import { Card, CardContent } from "@researchmind/ui";
import { Link } from "react-router-dom";
import { BookOpen, Cloud, RefreshCw, FileText, Shield } from "lucide-react";
import { t } from "@/i18n";

const faqCategories = [
  { icon: BookOpen, title: t("help.desktopTitle"), desc: t("help.desktopDescription") },
  { icon: Cloud, title: t("help.cloudTitle"), desc: t("help.cloudDescription") },
  { icon: RefreshCw, key: "syncConflicts" },
  { icon: FileText, key: "exportReports" },
  { icon: Shield, key: "security" },
];

const faqCategoryLabels: Record<string, string> = {
  syncConflicts: t("help.categories.syncConflicts"),
  exportReports: t("help.categories.exportReports"),
  security: t("help.categories.security"),
  gettingStarted: t("help.categories.gettingStarted"),
  connectCloud: t("help.categories.connectCloud"),
};

export default function HelpCenterPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">{t("help.title")}</h2>
        <p className="page-subtitle">{t("help.subtitle")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {faqCategories.map((item) => {
          const label = item.title || faqCategoryLabels[item.key || ""] || "";
          const desc = item.desc || "";
          return (
            <Card key={item.key || label}>
              <CardContent>
                <div className="flex items-start gap-3">
                  <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
                  <div>
                    <h3 className="font-semibold text-slate-100">{label}</h3>
                    {desc ? <p className="mt-1 text-sm text-slate-400">{desc}</p> : null}
                  </div>
                </div>
                <Link to="/docs" className="mt-3 inline-block text-sm text-sky-400">{t("help.openDocs")}</Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
