import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
        "3xl": "calc(var(--radius) + 14px)",
      },
      boxShadow: {
        tactile: "0 4px 0 0 var(--border-ledge, hsl(var(--border)))",
        "tactile-sm": "0 3px 0 0 var(--border-ledge, hsl(var(--border)))",
        "tactile-lg": "0 6px 0 0 var(--border-ledge, hsl(var(--border)))",
        "tactile-none": "0 0px 0 0 transparent",
        "tactile-primary": "0 4px 0 0 var(--primary-ledge)",
        "tactile-secondary": "0 4px 0 0 var(--secondary-ledge)",
        "tactile-accent": "0 4px 0 0 var(--accent-ledge)",
        "tactile-destructive": "0 4px 0 0 var(--destructive-ledge)",
      },
      keyframes: {
        "bounce-pop": {
          "0%": { transform: "scale(0.92)" },
          "50%": { transform: "scale(1.04)" },
          "100%": { transform: "scale(1)" },
        },
        squish: {
          "0%, 100%": { transform: "scale(1, 1)" },
          "40%": { transform: "scale(1.06, 0.94)" },
          "70%": { transform: "scale(0.97, 1.03)" },
        },
        "float-up": {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "25%": { transform: "rotate(-4deg)" },
          "75%": { transform: "rotate(4deg)" },
        },
      },
      animation: {
        "bounce-pop": "bounce-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)",
        squish: "squish 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "float-up": "float-up 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
        wiggle: "wiggle 0.35s ease-in-out",
      },
    },
  },
};

export default config;
