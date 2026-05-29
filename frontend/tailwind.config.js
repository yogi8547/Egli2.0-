/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          50: '#f0f0f0',
          100: '#e0e0e0',
          200: '#c0c0c0',
          300: '#a0a0a0',
          400: '#808080',
          500: '#606060',
          600: '#404040',
          700: '#1e1e2e',
          800: '#181825',
          900: '#11111b',
          950: '#0a0a14',
        },
        accent: {
          400: '#5e81ac',
          500: '#81a1c1',
          600: '#88c0d0',
        },
        success: '#a3be8c',
        warning: '#ebcb8b',
        danger: '#bf616a',
        info: '#b48ead',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(129, 161, 193, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(129, 161, 193, 0.6)' },
        },
      },
    },
  },
  plugins: [],
};
