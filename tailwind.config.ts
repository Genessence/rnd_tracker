import type { Config } from 'tailwindcss';

const v = (name: string) => `var(--${name})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        surface: v('surface'),
        line: v('line'),
        ink: { DEFAULT: v('ink'), 2: v('ink-2') },
        accent: { DEFAULT: v('accent'), soft: v('accent-soft') },
        ok: { DEFAULT: v('ok'), soft: v('ok-soft') },
        risk: { DEFAULT: v('risk'), soft: v('risk-soft') },
        late: { DEFAULT: v('late'), soft: v('late-soft') },
        wait: { DEFAULT: v('wait'), soft: v('wait-soft') },
        hold: { DEFAULT: v('hold'), soft: v('hold-soft') },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        body: ['13px', '20px'],
        table: ['12px', '18px'],
        title: ['20px', '28px'],
        kpi: ['28px', '32px'],
      },
      borderRadius: { card: '10px', input: '6px' },
      maxWidth: { content: '1440px' },
      boxShadow: { popover: '0 8px 24px rgba(27, 34, 48, 0.12)' },
    },
  },
  plugins: [],
} satisfies Config;
