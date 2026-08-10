/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/pages/**/*.php",
    "./public/*.php",
    "./src/includes/**/*.php",
    "./src/components/**/*.php",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Astryx Semantic tokens mapped to Tailwind utility class names
        primary: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        disabled: 'var(--color-text-disabled)',
        accent: 'var(--color-text-accent)',
        
        surface: 'var(--color-background-surface)',
        body: 'var(--color-background-body)',
        card: 'var(--color-background-card)',
        popover: 'var(--color-background-popover)',
        muted: 'var(--color-background-muted)',
        inverted: 'var(--color-background-inverted)',
        overlay: 'var(--color-overlay)',
        
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-emphasized)',
        
        success: 'var(--color-success)',
        error: 'var(--color-error)',
        warning: 'var(--color-warning)',

        // Slate mappings configured to pull directly from Astryx Theme variables
        slate: {
          50: 'var(--color-background-muted)',
          100: 'var(--color-background-body)',
          200: 'var(--color-border)',
          300: 'var(--color-border-emphasized)',
          400: 'var(--color-text-disabled)',
          500: 'var(--color-text-secondary)',
          600: 'var(--color-text-secondary)',
          700: 'var(--color-border-emphasized)',
          800: 'var(--color-background-surface)',
          900: 'var(--color-background-body)',
          950: 'var(--color-background-body)',
        }
      },
      fontFamily: {
        sans: ['Figtree', 'Sarabun', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xs: 'var(--radius-inner)',
        sm: 'var(--radius-inner)',
        md: 'var(--radius-element)',
        lg: 'var(--radius-container)',
        xl: 'var(--radius-page)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        }
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }
    },
  },
  plugins: [],
};