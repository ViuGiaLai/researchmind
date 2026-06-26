import React from "react";

// ─── Styles ───────────────────────────────────────────────────

const SKELETON_STYLE = (
  <style>{`
    @keyframes skeletonShimmer {
      0% {
        background-position: -200% 0;
      }
      100% {
        background-position: 200% 0;
      }
    }

    .skeleton-base {
      display: inline-block;
      height: 1em;
      background: rgba(255, 255, 255, 0.035);
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.03) 25%,
        rgba(255, 255, 255, 0.08) 37%,
        rgba(255, 255, 255, 0.03) 63%
      );
      background-size: 200% 100%;
      animation: skeletonShimmer 1.5s ease-in-out infinite;
      border-radius: var(--radius-xs, 4px);
    }

    [data-theme="light"] .skeleton-base {
      background: rgba(0, 0, 0, 0.03);
      background: linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.03) 25%,
        rgba(0, 0, 0, 0.07) 37%,
        rgba(0, 0, 0, 0.03) 63%
      );
      background-size: 200% 100%;
    }

    /* Container layouts */
    .skeleton-library-row {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 12px);
      padding: 12px 16px;
      background: var(--color-surface, #0f0f11);
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
      border-radius: var(--radius-sm, 8px);
      box-shadow: var(--shadow-sm);
      margin-bottom: 8px;
    }
  `}</style>
);

// ─── Base Skeleton Component ───────────────────────────────

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = "1rem",
  borderRadius,
  className = "",
  style,
}) => {
  const customStyle: React.CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
    borderRadius: borderRadius !== undefined ? (typeof borderRadius === "number" ? `${borderRadius}px` : borderRadius) : undefined,
    ...style,
  };

  return (
    <>
      {SKELETON_STYLE}
      <span className={`skeleton-base ${className}`} style={customStyle} />
    </>
  );
};

// ─── Paper Card Skeleton ────────────────────────────────────

export const PaperCardSkeleton: React.FC = () => {
  return (
    <>
      {SKELETON_STYLE}
      <div className="skeleton-library-row">
        {/* Fake Checkbox */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
          <Skeleton width={16} height={16} borderRadius={4} />
        </div>

        {/* Fake Icon */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", marginLeft: 4 }}>
          <Skeleton width={22} height={22} borderRadius={6} />
        </div>

        {/* Content area */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, marginLeft: 2 }}>
          {/* Fake Title */}
          <Skeleton width="55%" height={14} borderRadius={4} />
          {/* Fake Meta line */}
          <Skeleton width="30%" height={10} borderRadius={3} />
        </div>
      </div>
    </>
  );
};

// ─── List Skeleton ──────────────────────────────────────────

interface ListSkeletonProps {
  count?: number;
}

export const ListSkeleton: React.FC<ListSkeletonProps> = ({ count = 5 }) => {
  return (
    <div style={{ width: "100%" }}>
      {Array.from({ length: count }).map((_, idx) => (
        <PaperCardSkeleton key={idx} />
      ))}
    </div>
  );
};

// ─── Highlight Card Skeleton ─────────────────────────────────

export const HighlightCardSkeleton: React.FC = () => {
  return (
    <>
      {SKELETON_STYLE}
      <div className="hl-evidence-card" style={{ borderLeft: "3px solid var(--color-border)", position: "relative", marginBottom: 12 }}>
        {/* Fake context checkbox toggle */}
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <Skeleton width={18} height={18} borderRadius={4} />
        </div>

        {/* Fake Header: Category badge + stars */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <Skeleton width={90} height={18} borderRadius={4} />
          <Skeleton width={45} height={11} borderRadius={3} />
        </div>

        {/* Fake Body paragraphs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8, paddingRight: 28 }}>
          <Skeleton width="100%" height={12} borderRadius={3} />
          <Skeleton width="96%" height={12} borderRadius={3} />
          <Skeleton width="65%" height={12} borderRadius={3} />
        </div>
      </div>
    </>
  );
};

// ─── Highlight List Skeleton ────────────────────────────────

export const HighlightListSkeleton: React.FC<ListSkeletonProps> = ({ count = 3 }) => {
  return (
    <div style={{ width: "100%" }}>
      {Array.from({ length: count }).map((_, idx) => (
        <HighlightCardSkeleton key={idx} />
      ))}
    </div>
  );
};
