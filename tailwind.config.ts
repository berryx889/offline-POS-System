import type { Config } from "tailwindcss";

// Design tokens from pos-prd.md §9. These are the ONLY colors the app uses.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Fresher grocery-green direction (SiMi Shop reference), kept readable in
        // bright shop lighting. `ledger` is the primary fill/accent; `leaf` is the
        // light tint for hovers, selected rows, and active-nav backgrounds.
        paper: "#F1F6F2",
        ledger: "#27A567",
        "ledger-deep": "#1E8A54",
        leaf: "#E9F6EE",
        ink: "#1C2522",
        tape: "#FFFFFF",
        carbon: "#3A5FA8",
        stamp: "#E0503A",
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
        // Soft, diffuse card elevation (SiMi Shop reference) — no hard 1px line.
        card: "0 6px 20px -6px rgba(20,60,40,0.10), 0 2px 6px -2px rgba(20,60,40,0.06)",
        soft: "0 2px 10px -2px rgba(20,60,40,0.08)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
