import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
        dark: { 800: '#1e293b', 900: '#0f172a', 950: '#020617' },
      },
    },
  },
  plugins: [],
} satisfies Config;
