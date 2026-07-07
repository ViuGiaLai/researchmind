import React from "react";

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

  return <span className={`skeleton-base ${className}`} style={customStyle} aria-hidden />;
};

export const PaperCardSkeleton: React.FC = () => (
  <div className="skeleton-library-row">
    <div style={{ flexShrink: 0 }}>
      <Skeleton width={16} height={16} borderRadius={4} />
    </div>
    <div style={{ flexShrink: 0, marginLeft: 4 }}>
      <Skeleton width={22} height={22} borderRadius={6} />
    </div>
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, marginLeft: 2 }}>
      <Skeleton width="55%" height={14} borderRadius={4} />
      <Skeleton width="30%" height={10} borderRadius={3} />
    </div>
  </div>
);

interface ListSkeletonProps {
  count?: number;
}

export const ListSkeleton: React.FC<ListSkeletonProps> = ({ count = 5 }) => (
  <div style={{ width: "100%" }}>
    {Array.from({ length: count }).map((_, idx) => (
      <PaperCardSkeleton key={idx} />
    ))}
  </div>
);

export const HighlightCardSkeleton: React.FC = () => (
  <div className="hl-evidence-card" style={{ borderLeft: "3px solid var(--color-primary-muted)", position: "relative", marginBottom: 12 }}>
    <div style={{ position: "absolute", top: 12, right: 12 }}>
      <Skeleton width={18} height={18} borderRadius={4} />
    </div>
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
      <Skeleton width={90} height={18} borderRadius={4} />
      <Skeleton width={45} height={11} borderRadius={3} />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8, paddingRight: 28 }}>
      <Skeleton width="100%" height={12} borderRadius={3} />
      <Skeleton width="96%" height={12} borderRadius={3} />
      <Skeleton width="65%" height={12} borderRadius={3} />
    </div>
  </div>
);

export const HighlightListSkeleton: React.FC<ListSkeletonProps> = ({ count = 3 }) => (
  <div style={{ width: "100%" }}>
    {Array.from({ length: count }).map((_, idx) => (
      <HighlightCardSkeleton key={idx} />
    ))}
  </div>
);
