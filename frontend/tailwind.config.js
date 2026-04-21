/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"SF Pro Display"',
          '"SF Pro Text"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Inter"',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"SF Mono"',
          '"JetBrains Mono"',
          '"Fira Code"',
          'ui-monospace',
          'monospace',
        ],
      },
      colors: {
        // Apple-flavored neutrals
        background: "#08080A",
        surface: "#0F0F12",
        elevated: "#16161B",
        hover: "#1C1C22",

        // Legacy alias kept for existing components (used to be #161B22)
        panel: "#16161B",

        // Borders
        hairline: "rgba(255,255,255,0.06)",
        border: "rgba(255,255,255,0.10)",

        // Brand
        primary: "#2DD4BF",     // teal — kept
        secondary: "#F59E0B",   // amber — kept
        success: "#30D158",     // Apple green
        danger: "#FF453A",      // Apple red
        warning: "#FF9F0A",     // Apple orange

        // Text
        textMain: "#F5F5F7",
        textMuted: "#A1A1A6",
        textFaint: "#6E6E73",
      },
      backgroundImage: {
        'app-gradient': 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(45,212,191,0.10) 0%, transparent 60%)',
        'sales-gradient': 'linear-gradient(135deg, #F59E0B 0%, #FB7185 100%)',
        'support-gradient': 'linear-gradient(135deg, #2DD4BF 0%, #22D3EE 100%)',
      },
      boxShadow: {
        'apple-sm': '0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
        'apple-md': '0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)',
        'apple-lg': '0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
        'glow-primary': '0 0 32px rgba(45,212,191,0.25)',
        'glow-amber': '0 0 32px rgba(245,158,11,0.30)',
      },
      borderRadius: {
        'xl2': '14px',
        '2xl2': '18px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
