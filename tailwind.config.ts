import type { Config } from "tailwindcss";

// Design tokens from pos-prd.md §9. These are the ONLY colors the app uses.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F4F6F5",
        ledger: "#0E5A45",
        "ledger-deep": "#093F30",
        ink: "#1C2522",
        tape: "#FFFFFF",
        carbon: "#3A5FA8",
        stamp: "#C0392B",
        brass: "#B98A2F",
      },
      fontFamily: {
        // Archivo for UI, IBM Plex Mono for money + receipt tape. Bundled locally.
        sans: ['"Archivo"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        // Scale: 13 / 15 / 18 / 24 / 34 / 48
        xs: ["13px", "18px"],
        sm: ["15px", "22px"],
        base: ["15px", "22px"],
        lg: ["18px", "26px"],
        xl: ["24px", "30px"],
        "2xl": ["34px", "40px"],
        "3xl": ["48px", "52px"],
      },
      boxShadow: {
        // Elevation = 1px ink-8% border + a soft shadow, nothing heavier.
        card: "0 1px 3px rgba(28,37,34,0.08), 0 1px 2px rgba(28,37,34,0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
