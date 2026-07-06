import React, { useState } from "react";
import { LibraryView } from "../library/LibraryView";
import { HighlightsLibraryView } from "../library/HighlightsLibraryView";
import { SearchView } from "../search/SearchView";
import { DiscoveryView } from "../discovery/DiscoveryView";
import { IconLibrary, IconBookmark, IconSearch, IconSparkle } from "../Icons";
import { SubTabBar } from "../shared/SubTabBar";

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

  const tabs = [
    { key: "library" as const, icon: IconLibrary, label: "Thư viện" },
    { key: "highlights" as const, icon: IconBookmark, label: "Đoạn trích" },
    { key: "search" as const, icon: IconSearch, label: "Tìm kiếm" },
    { key: "discovery" as const, icon: IconSparkle, label: "Khám phá" },
  ];

  return (
    <div className="hub-shell">
      <SubTabBar tabs={tabs} active={subTab} onChange={setSubTab} variant="underline" />
      <div className="hub-shell__content">
        {subTab === "library" && <LibraryView {...props} />}
        {subTab === "highlights" && <HighlightsLibraryView onStartChat={props.onStartChat} />}
        {subTab === "search" && <SearchView onStartChat={props.onStartChat} />}
        {subTab === "discovery" && <DiscoveryView />}
      </div>
    </div>
  );
};
