import React, { useCallback, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { WELCOME_TOUR_STEPS, WELCOME_STORAGE_KEY } from "./helpContent";
import { IconArrowRight, IconClose } from "../Icons";

interface WelcomeTourProps {
  onComplete: () => void;
  onOpenHelp: () => void;
  onPrepareStep?: (targetId: string) => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function hasSeenWelcomeTour(): boolean {
  try {
    return localStorage.getItem(WELCOME_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWelcomeTourSeen(): void {
  try {
    localStorage.setItem(WELCOME_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function resetWelcomeTourSeen(): void {
  try {
    localStorage.removeItem(WELCOME_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function computeCardStyle(rect: DOMRect, targetId: string): React.CSSProperties {
  const cardW = Math.min(420, window.innerWidth - 32);
  const margin = 16;

  if (targetId === "app-help-btn") {
    return {
      position: "fixed",
      top: rect.bottom + 12,
      right: margin,
      left: "auto",
      width: cardW,
    };
  }

  if (rect.right + cardW + 24 < window.innerWidth) {
    return {
      position: "fixed",
      top: Math.max(margin, Math.min(rect.top, window.innerHeight - 300)),
      left: rect.right + 16,
      width: cardW,
    };
  }

  return {
    position: "fixed",
    top: Math.min(rect.bottom + 12, window.innerHeight - 280),
    left: Math.max(margin, rect.left),
    width: cardW,
  };
}

export const WelcomeTour: React.FC<WelcomeTourProps> = ({ onComplete, onOpenHelp, onPrepareStep }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [cardStyle, setCardStyle] = useState<React.CSSProperties>({});
  const current = WELCOME_TOUR_STEPS[step];
  const isLast = step === WELCOME_TOUR_STEPS.length - 1;

  const finish = () => {
    markWelcomeTourSeen();
    onComplete();
  };

  const next = () => {
    if (isLast) finish();
    else setStep((s) => s + 1);
  };

  const updateSpotlight = useCallback(() => {
    document.querySelectorAll(".welcome-tour-highlight").forEach((el) => {
      el.classList.remove("welcome-tour-highlight");
    });

    const el = document.getElementById(current.target);
    if (!el) {
      setSpotlight(null);
      setCardStyle({
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: Math.min(420, window.innerWidth - 32),
      });
      return;
    }

    el.classList.add("welcome-tour-highlight");
    const rect = el.getBoundingClientRect();
    const pad = 6;
    setSpotlight({
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    });
    setCardStyle(computeCardStyle(rect, current.target));
  }, [current.target]);

  useLayoutEffect(() => {
    onPrepareStep?.(current.target);

    const measure = () => updateSpotlight();
    const frame = window.requestAnimationFrame(measure);
    const delayed = window.setTimeout(measure, 240);

    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayed);
      window.removeEventListener("resize", measure);
      document.querySelectorAll(".welcome-tour-highlight").forEach((el) => {
        el.classList.remove("welcome-tour-highlight");
      });
    };
  }, [step, current.target, onPrepareStep, updateSpotlight]);

  const content = (
    <div className="welcome-tour-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-tour-title">
      {spotlight && (
        <div
          className="welcome-tour-spotlight"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}
      <div className="welcome-tour-card aw-fade-up" style={cardStyle}>
        <div className="welcome-tour-progress">
          {WELCOME_TOUR_STEPS.map((_, i) => (
            <span key={i} className={`welcome-tour-dot${i === step ? " active" : i < step ? " done" : ""}`} />
          ))}
        </div>
        <button type="button" className="welcome-tour-skip" onClick={finish} aria-label={t("help.skip")}>
          <IconClose size={16} />
        </button>
        <h2 id="welcome-tour-title" className="welcome-tour-title">{t(current.title)}</h2>
        <p className="welcome-tour-body">{t(current.body)}</p>
        <div className="welcome-tour-actions">
          {step > 0 && (
            <button type="button" className="rm-btn rm-btn--ghost" onClick={() => setStep((s) => s - 1)}>
              {t("help.back")}
            </button>
          )}
          <button type="button" className="rm-btn rm-btn--outline" onClick={() => { finish(); onOpenHelp(); }}>
            {t("help.open_docs")}
          </button>
          <button type="button" className="rm-btn rm-btn--primary" onClick={next}>
            {isLast ? t("help.start") : t("help.next")}
            {!isLast && <IconArrowRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
