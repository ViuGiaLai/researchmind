import React from "react";

export interface SubTabItem<T extends string> {
  key: T;
  icon?: React.FC<{ size?: number; className?: string }>;
  label: string;
}

interface SubTabBarProps<T extends string> {
  tabs: SubTabItem<T>[];
  active: T;
  onChange: (key: T) => void;
  variant?: "underline" | "pills";
  label?: string;
}

export function SubTabBar<T extends string>({
  tabs,
  active,
  onChange,
  variant = "underline",
  label,
}: SubTabBarProps<T>) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    onChange(tabs[nextIndex].key);
    const tabList = event.currentTarget.closest('[role="tablist"]');
    tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  };

  return (
    <div className={`sub-tab-bar sub-tab-bar--${variant}`} role="tablist" aria-label={label}>
      {label && <span className="sub-tab-bar__section-label">{label}</span>}
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`sub-tab-bar__btn${isActive ? " active" : ""}`}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => handleKeyDown(event, tabs.indexOf(tab))}
          >
            {Icon && <Icon size={16} />}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
