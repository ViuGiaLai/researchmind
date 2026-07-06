import React, { useState } from "react";
import { ReviewBuilderView } from "../review/ReviewBuilderView";
import { InsightsView } from "../insights/InsightsView";
import { ScreeningBoard } from "../screening/ScreeningBoard";
import { IconBookOpen, IconBulb, IconFilter } from "../Icons";
import { SubTabBar } from "../shared/SubTabBar";

type SubTab = "review" | "insights" | "screening";

export const ReviewHub: React.FC<{
  onStartChat: (paperIds: string[]) => void;
}> = ({ onStartChat }) => {
  const [subTab, setSubTab] = useState<SubTab>("review");

  const tabs = [
    { key: "review" as const, icon: IconBookOpen, label: "Đánh giá" },
    { key: "insights" as const, icon: IconBulb, label: "Nhận định" },
    { key: "screening" as const, icon: IconFilter, label: "Sàng lọc" },
  ];

  return (
    <div className="hub-shell">
      <SubTabBar tabs={tabs} active={subTab} onChange={setSubTab} variant="underline" />
      <div className="hub-shell__content">
        {subTab === "review" && <ReviewBuilderView />}
        {subTab === "insights" && <InsightsView onStartChat={onStartChat} />}
        {subTab === "screening" && <ScreeningBoard />}
      </div>
    </div>
  );
};
