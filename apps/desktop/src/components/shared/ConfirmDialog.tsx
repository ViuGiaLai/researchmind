import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDialogFocus } from "../../hooks/useDialogFocus";

interface ConfirmOptions {
  destructive?: boolean;
  title?: string;
}

interface PendingConfirmation extends ConfirmOptions {
  message: string;
  resolve: (confirmed: boolean) => void;
}

export function useConfirmDialog() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const close = useCallback((confirmed: boolean) => {
    setPending((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  const dialogRef = useDialogFocus<HTMLDivElement>(Boolean(pending), () => close(false));

  useEffect(() => () => {
    pending?.resolve(false);
  }, [pending]);

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) =>
    new Promise<boolean>((resolve) => {
      setPending({ message, resolve, ...options });
    }), []);

  const confirmationDialog = pending ? (
    <div className="rm-overlay confirm-dialog-overlay" onClick={() => close(false)}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog__title">
          {pending.title || t("common.confirm_action")}
        </h2>
        <p id="confirm-dialog-message" className="confirm-dialog__message">{pending.message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="rm-btn rm-btn-secondary" onClick={() => close(false)}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={`rm-btn ${pending.destructive ? "confirm-dialog__button--danger" : "rm-btn-primary"}`}
            onClick={() => close(true)}
          >
            {t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmationDialog };
}

interface PromptOptions {
  title: string;
  message: string;
  initialValue?: string;
}

interface PendingPrompt extends PromptOptions {
  resolve: (value: string | null) => void;
}

export function usePromptDialog() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const [value, setValue] = useState("");

  const close = useCallback((result: string | null) => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const dialogRef = useDialogFocus<HTMLFormElement>(Boolean(pending), () => close(null));

  const prompt = useCallback((options: PromptOptions) =>
    new Promise<string | null>((resolve) => {
      setValue(options.initialValue || "");
      setPending({ ...options, resolve });
    }), []);

  const promptDialog = pending ? (
    <div className="rm-overlay confirm-dialog-overlay" onClick={() => close(null)}>
      <form
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          close(value.trim() || null);
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="prompt-dialog-title" className="confirm-dialog__title">{pending.title}</h2>
        <label className="prompt-dialog__label">
          <span>{pending.message}</span>
          <input
            className="rm-input prompt-dialog__input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
          />
        </label>
        <div className="confirm-dialog__actions">
          <button type="button" className="rm-btn rm-btn-secondary" onClick={() => close(null)}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="rm-btn rm-btn-primary" disabled={!value.trim()}>
            {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  ) : null;

  return { prompt, promptDialog };
}
