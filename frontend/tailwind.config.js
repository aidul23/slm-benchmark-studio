/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d4d8e0",
          300: "#aab2c0",
          400: "#7c869a",
          500: "#56627a",
          600: "#3f4961",
          700: "#2f364a",
          800: "#1f2433",
          900: "#11151f",
        },
        accent: {
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      backgroundImage: {
        "progress-stripes":
          "linear-gradient(135deg, rgba(255,255,255,0.25) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.25) 75%, transparent 75%, transparent)",
      },
      keyframes: {
        "stripe-shift": {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "1rem 0" },
        },
      },
      animation: {
        "stripe-shift": "stripe-shift 1s linear infinite",
      },
    },
  },
  plugins: [],
};
