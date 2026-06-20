import React from "react";
import { IconError } from "../Icons";

interface LocalErrorBannerProps {
  title?: string;
  message?: string;
}

export const LocalErrorBanner: React.FC<LocalErrorBannerProps> = ({
  title = "Không thể kết nối đến llama-server",
  message,
}) => {
  return (
    <div className="local-error-banner compact">
      <div className="local-error-header">
        <IconError size={16} />
        <span className="local-error-title">{title}</span>
      </div>
      {message && <p className="local-error-message">{message}</p>}
    </div>
  );
};
