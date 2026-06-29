import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Airbnb-inspired light palette.
        canvas: {
          900: "#F7F7F7", // page background
          800: "#FFFFFF", // cards
          700: "#F4F4F4", // subtle fills / inputs
          600: "#EBEBEB", // hover / chips
        },
        line: "#EBEBEB",
        hairline: "#DDDDDD",
        ink: {
          DEFAULT: "#222222", // primary text
          2: "#717171", // secondary text
          3: "#A6A6A6", // muted text
        },
        brand: {
          DEFAULT: "#FF385C", // Rausch coral
          600: "#E00B41",
          700: "#C30B41",
          300: "#FF5A5F",
        },
        mint: "#00A699", // positive (Hof teal-green)
        amber: "#FFB400", // star gold / warning
        rose: "#C13515", // error / negative (Arches)
        cyan: "#008489", // accent teal (Babu)
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 6px 16px rgba(0,0,0,0.06)",
        cardHover: "0 2px 4px rgba(0,0,0,0.06), 0 12px 28px rgba(0,0,0,0.12)",
        glow: "0 6px 20px rgba(255,56,92,0.25)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
