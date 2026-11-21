/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ground: 'var(--color-ground)',
        surface: 'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        ink: 'var(--color-ink)',
        'ink-muted': 'var(--color-ink-muted)',
        line: 'var(--color-line)',
        accent: 'var(--color-accent)',
        'on-accent': 'var(--color-on-accent)',
        focus: 'var(--color-focus)',
        ok: 'var(--color-ok)',
        'ok-bg': 'var(--color-ok-bg)',
        warn: 'var(--color-warn)',
        'warn-bg': 'var(--color-warn-bg)',
        alert: 'var(--color-alert)',
        'alert-bg': 'var(--color-alert-bg)',
        camera: 'var(--color-camera)',
        'on-camera': 'var(--color-on-camera)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
      },
      borderWidth: {
        DEFAULT: 'var(--border-thin)',
        w: 'var(--border-w)',
        thin: 'var(--border-thin)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        caption: ['var(--text-caption)', { lineHeight: '1.2' }],
        body: ['var(--text-body)', { lineHeight: 'var(--leading-body)' }],
        lead: ['var(--text-lead)', { lineHeight: 'var(--leading-tight)' }],
        title: ['var(--text-title)', { lineHeight: 'var(--leading-tight)' }],
        display: ['var(--text-display)', { lineHeight: 'var(--leading-tight)' }],
        hero: ['var(--text-hero)', { lineHeight: 'var(--leading-tight)' }],
      },
      spacing: {
        1: 'var(--spacing-1)',
        2: 'var(--spacing-2)',
        3: 'var(--spacing-3)',
        4: 'var(--spacing-4)',
        5: 'var(--spacing-5)',
        6: 'var(--spacing-6)',
        8: 'var(--spacing-8)',
        10: 'var(--spacing-10)',
      },
      lineHeight: {
        tight: 'var(--leading-tight)',
        body: 'var(--leading-body)',
      },
      letterSpacing: {
        display: 'var(--tracking-display)',
      },
      boxShadow: {
        card: 'var(--shadow-offset) var(--shadow-offset) 0 var(--color-ink)',
      }
    },
  },
  plugins: [],
}
