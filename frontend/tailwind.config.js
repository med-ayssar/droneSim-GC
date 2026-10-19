/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        lattice: {
          bg: '#070707',
          panel: '#0e0e0e',
          card: '#141414',
          line: '#2a2a2a',
          lineFocus: '#3e3e3e',
          mute: '#7a766c',
          ink: '#e8e4d9',
          amber: '#c4a574',
          ok: '#7d9a6a',
          warn: '#c4a574',
          bad: '#b85c4a',
          blue: '#4a88b8',
          cyan: '#38bdf8',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'lattice-glow': '0 0 15px rgba(196, 165, 116, 0.15)',
        'lattice-red': '0 0 15px rgba(184, 92, 74, 0.25)',
      },
    },
  },
  plugins: [],
};

