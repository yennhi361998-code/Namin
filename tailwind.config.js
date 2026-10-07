/** @type {import('tailwindcss').Config} */
// Tokens mirror the Stitch "Pastel Sky Hearth" design system.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // App background: Pantone 11-0515 TCX Lemon Icing.
        canvas: '#F6EBC8',
        // Header band and app-icon background: Pantone 13-4306 TCX Ice Melt.
        header: '#D3E4F1',
        // Deep blue-grey for readability on Ice Melt header background.
        'header-ink': '#1F5A7B',
        // Note-paper task lists (Home Today, Tasks day list).
        note: { DEFAULT: '#F4FAFD', edge: '#BBD8EB', line: '#A2CDE4', fold: '#D4E7F4', ring: '#7AAECB' },
        // Sticky-note task paper: Lemon Icing.
        sticky: { DEFAULT: '#F6EBC8', edge: '#E4D2A2', line: '#DCC58F', fold: '#EDE0B4' },
        surface: '#FFFFFF',
        sky: '#D3E4F1',
        'sky-hover': '#C0DAEC',
        'sky-dark': '#3A779C',
        link: '#1F5A7B',
        soft: '#EBF3F9',
        ink: '#26343B',
        'ink-sub': '#7A8991',
        'ink-muted': '#40484D',
        line: '#E5EEF2',
        'line-strong': '#D5E5EB',
        done: '#DDF1EA',
        'done-ink': '#2A6B53',
        warn: '#FFF1D8',
        'warn-ink': '#7D5B18',
        err: '#F8DEDE',
        'err-ink': '#8A2E2E',
        cat: {
          cleaning: '#8CC9E8',
          kitchen: '#A9D8C8',
          bathroom: '#B8C7E6',
          groceries: '#F2D6A7',
          maintenance: '#D7C4E8',
          other: '#CBD5DA',
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'headline-lg': ['26px', { lineHeight: '32px', letterSpacing: '-0.015em', fontWeight: '600' }],
        'headline-md': ['20px', { lineHeight: '26px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'title-sm': ['17px', { lineHeight: '22px', letterSpacing: '-0.005em', fontWeight: '600' }],
        'body-lg': ['17px', { lineHeight: '24px', letterSpacing: '-0.005em' }],
        'body-md': ['16px', { lineHeight: '22px' }],
        'body-sm': ['13px', { lineHeight: '18px', letterSpacing: '0.005em' }],
        'label-md': ['14px', { lineHeight: '18px', letterSpacing: '0.01em', fontWeight: '500' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '500' }],
        caption: ['12px', { lineHeight: '16px', letterSpacing: '0.03em', fontWeight: '500' }],
      },
      spacing: {
        margin: '1rem',
        'space-xs': '0.25rem',
        'space-sm': '0.5rem',
        'space-md': '0.75rem',
        'space-lg': '1rem',
        'space-xl': '1.5rem',
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '0.875rem',
      },
      boxShadow: {
        card: '0 2px 8px -2px rgba(95,168,204,0.08), 0 1px 3px 0 rgba(38,52,59,0.03)',
        lifted: '0 6px 16px -4px rgba(95,168,204,0.14), 0 2px 6px -1px rgba(38,52,59,0.04)',
        float: '0 12px 32px -6px rgba(38,52,59,0.12)',
      },
    },
  },
  plugins: [],
};
