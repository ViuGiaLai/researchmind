import React from "react";
import { cn } from "@researchmind/utils";

const LOGO_SRC = "/icon.ico";

type BrandLogoProps = {
  className?: string;
  size?: number;
  alt?: string;
};

/** Official ResearchMind mark — tab favicon + in-app brand. */
export function BrandLogo({ className, size = 32, alt = "ResearchMind" }: BrandLogoProps) {
  return (
    <img
      src={LOGO_SRC}
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
      decoding="async"
    />
  );
}

export const BRAND_LOGO_SRC = LOGO_SRC;
