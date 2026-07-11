import React from "react";
import { useTranslation } from "react-i18next";
import { IconError } from "../Icons";

interface LocalErrorBannerProps {
  title?: string;
  message?: string;
}

export const LocalErrorBanner: React.FC<LocalErrorBannerProps> = ({
  title,
  message,
}) => {
  const { t } = useTranslation();
  return (
    <div className="local-error-banner compact">
      <div className="local-error-header">
        <IconError size={16} />
        <span className="local-error-title">{title ?? t("error.llama_connect")}</span>
      </div>
      {message && <p className="local-error-message">{message}</p>}
    </div>
  );
};
