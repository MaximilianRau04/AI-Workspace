/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          base:    '#0f0f0f',
          surface: '#1a1a1a',
          muted:   '#1e1e1e',
          hover:   '#242424',
        },
        border: {
          DEFAULT: '#2e2e2e',
          subtle:  '#232323',
        },
        accent: {
          DEFAULT: '#2f6df5',
          hover:   '#1a5de0',
          dim:     '#1e2a40',
        },
        txt: {
          primary: '#e5e5e5',
          muted:   '#aaa',
          dim:     '#666',
          heading: '#ffffff',
        },
      },
    },
  },
  plugins: [],
}
