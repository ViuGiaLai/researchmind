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
  return (
    <div className={`sub-tab-bar sub-tab-bar--${variant}`} role="tablist">
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
            className={`sub-tab-bar__btn${isActive ? " active" : ""}`}
            onClick={() => onChange(tab.key)}
          >
            {Icon && <Icon size={16} />}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
