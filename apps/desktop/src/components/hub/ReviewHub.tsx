import React, { useState } from "react";
import { ReviewBuilderView } from "../review/ReviewBuilderView";
import { InsightsView } from "../insights/InsightsView";
import { ScreeningBoard } from "../screening/ScreeningBoard";
import { IconBookOpen, IconBulb, IconFilter } from "../Icons";

type SubTab = "review" | "insights" | "screening";

export const ReviewHub: React.FC<{
  onStartChat: (paperIds: string[]) => void;
}> = ({ onStartChat }) => {
  const [subTab, setSubTab] = useState<SubTab>("review");

  const tabs: { key: SubTab; icon: React.FC<{ size?: number }>; label: string }[] = [
    { key: "review", icon: IconBookOpen, label: "Đánh giá" },
    { key: "insights", icon: IconBulb, label: "Nhận định" },
    { key: "screening", icon: IconFilter, label: "Sàng lọc" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", gap: "4px", padding: "12px 16px 0",
        borderBottom: "1px solid var(--color-border, #282828)",
      }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = subTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              style={{
                padding: "8px 16px",
                border: "none",
                borderBottom: active ? "2px solid var(--color-primary, #6366f1)" : "2px solid transparent",
                background: "transparent",
                color: active ? "var(--color-primary, #6366f1)" : "var(--color-text-muted, #94a3b8)",
                cursor: "pointer",
                fontWeight: active ? 600 : 400,
                fontSize: "0.85rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "color 0.15s",
              }}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        {subTab === "review" && <ReviewBuilderView />}
        {subTab === "insights" && <InsightsView onStartChat={onStartChat} />}
        {subTab === "screening" && <ScreeningBoard />}
      </div>
    </div>
  );
};
