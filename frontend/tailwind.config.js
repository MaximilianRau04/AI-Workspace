/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          base:    'var(--bg-base)',
          surface: 'var(--bg-surface)',
          muted:   'var(--bg-muted)',
          hover:   'var(--bg-hover)',
        },
        border: {
          DEFAULT: 'var(--border)',
          subtle:  'var(--border-subtle)',
        },
        accent: {
          DEFAULT: '#2f6df5',
          hover:   '#1a5de0',
          dim:     'var(--accent-dim)',
        },
        txt: {
          primary: 'var(--txt-primary)',
          muted:   'var(--txt-muted)',
          dim:     'var(--txt-dim)',
          heading: 'var(--txt-heading)',
        },
      },
    },
  },
  plugins: [],
}
