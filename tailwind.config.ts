import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        jade: {
          50: '#f2f8f6',
          100: '#e1efe9',
          500: '#26594b',
          600: '#1e483d',
          700: '#183830',
        },
        honey: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#d97706',
          600: '#b45309',
        },
        brick: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#b91c1c',
          600: '#991b1b',
        },
        dusty: {
          50: '#f8fafc',
          100: '#f1f5f9',
          500: '#64748b',
          600: '#475569',
        },
        sage: {
          50: '#f9fafb', // Sage-white soft background
          100: '#f3f4f6',
          200: '#e5e7eb',
        },
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
      },
      fontFamily: {
        sans: ['var(--font-manrope)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-ibm)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}

export default config
