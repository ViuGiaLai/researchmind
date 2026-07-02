import React, { useState } from "react";
import { LibraryView } from "../library/LibraryView";
import { HighlightsLibraryView } from "../library/HighlightsLibraryView";
import { SearchView } from "../search/SearchView";
import { DiscoveryView } from "../discovery/DiscoveryView";
import { IconLibrary, IconBookmark, IconSearch, IconSparkle } from "../Icons";

type SubTab = "library" | "highlights" | "search" | "discovery";

export const LibraryHub: React.FC<{
  onStartChat: (paperIds: string[]) => void;
  onStartReview: (paperIds: string[]) => void;
  onStartCritique: (paperIds: string[]) => void;
  onStartDebate?: (paperIds: string[]) => void;
  onStartVerify?: (paperIds: string[]) => void;
  onStartWow?: (paperId: string) => void;
}> = (props) => {
  const [subTab, setSubTab] = useState<SubTab>("library");

  const tabs: { key: SubTab; icon: React.FC<{ size?: number }>; label: string }[] = [
    { key: "library", icon: IconLibrary, label: "Thư viện" },
    { key: "highlights", icon: IconBookmark, label: "Đoạn trích" },
    { key: "search", icon: IconSearch, label: "Tìm kiếm" },
    { key: "discovery", icon: IconSparkle, label: "Khám phá" },
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
        {subTab === "library" && <LibraryView {...props} />}
        {subTab === "highlights" && <HighlightsLibraryView onStartChat={props.onStartChat} />}
        {subTab === "search" && <SearchView onStartChat={props.onStartChat} />}
        {subTab === "discovery" && <DiscoveryView />}
      </div>
    </div>
  );
};
