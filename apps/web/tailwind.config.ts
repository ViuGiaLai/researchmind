import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Outfit", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        surface: {
          DEFAULT: "#0f172a",
          deep: "#090d16",
          raised: "#1e293b",
        },
      },
      boxShadow: {
        glow: "0 0 40px -12px rgba(56, 189, 248, 0.35)",
      },
    },
  },
  plugins: [],
} satisfies Config;
