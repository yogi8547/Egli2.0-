/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        dark: {
          50: 'var(--dark-50)',
          100: 'var(--dark-100)',
          200: 'var(--dark-200)',
          300: 'var(--dark-300)',
          400: 'var(--dark-400)',
          500: 'var(--dark-500)',
          600: 'var(--dark-600)',
          700: 'var(--dark-700)',
          800: 'var(--dark-800)',
          900: 'var(--dark-900)',
          950: 'var(--dark-950)',
        },
        navy: {
          50: '#e8ecf2',
          100: '#c5cedf',
          200: '#9eadc9',
          300: '#778cb3',
          400: '#5a74a3',
          500: '#002E6E',
          600: '#002a63',
          700: '#002458',
          800: '#001e4d',
          900: '#00163d',
          950: '#000f2e',
        },
        accent: {
          400: '#00D4FF',
          500: '#00B9F1',
          600: '#0098CC',
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
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 185, 241, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 185, 241, 0.6)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
    },
  },
  plugins: [],
};
