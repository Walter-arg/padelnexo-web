import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "pn-green":    "#1fa36d",
        "pn-dark":     "#11784e",
        "pn-navy":     "#0a1628",
        "pn-navy-light":"#0d2438",
        "pn-lime":     "#c8f53d",
        "pn-mint":     "#e9f8f1",
        "pn-mint-dark":"#d0f0e0",
        // App design system
        "app-bg":      "#e8f5ee",
        "app-heading": "#0d5c3a",
        "app-teal":    "#1e5f74",
        "app-blue":    "#1a5276",
        "app-orange":  "#f5a623",
        "app-card-blue":"#eaf2fb",
        "app-muted":   "#6b8f7e",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hero-gradient":
          "linear-gradient(135deg, #f0fdf6 0%, #e9f8f1 40%, #ffffff 100%)",
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-delay": "float 6s ease-in-out 2s infinite",
        "float-delay-2": "float 6s ease-in-out 4s infinite",
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
