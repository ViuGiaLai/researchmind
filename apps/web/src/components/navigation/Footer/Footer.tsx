import React from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/common/BrandLogo";
import { useI18n } from "@/i18n";

export function Footer() {
  const { t, tpl } = useI18n();
  return (
    <footer className="border-t border-slate-800 bg-slate-950/50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <BrandLogo size={28} />
            <div className="font-display text-lg font-bold text-slate-50">ResearchMind</div>
          </div>
          <p className="mt-2 max-w-sm text-sm text-slate-400">
            {t("footer.desc")}
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-200">{t("footer.product")}</div>
          <div className="mt-3 flex flex-col gap-2 text-sm text-slate-400">
            <Link to="/download">{t("nav.download")}</Link>
            <Link to="/pricing">{t("nav.pricing")}</Link>
            <Link to="/docs">{t("nav.docs")}</Link>
            <Link to="/changelog">Changelog</Link>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-200">{t("footer.legal")}</div>
          <div className="mt-3 flex flex-col gap-2 text-sm text-slate-400">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/contact">Contact</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        {tpl("footer.copyright", { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
