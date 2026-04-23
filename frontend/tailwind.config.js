/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],

  // ✅ optional but recommended
  darkMode: 'class',

  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },

      colors: {
        brand: {
          50:  '#fdf4e7',
          100: '#fbe0b3',
          200: '#f8c97d',
          300: '#f5b047',
          400: '#f29722',
          500: '#e07d0a',
          600: '#b86207',
          700: '#8f4905',
          800: '#663203',
          900: '#3d1c01',
        },
        slate: {
          950: '#0a0e1a',
        }
      },

      animation: {
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },

      keyframes: {
        slideIn: {
          from: { transform: 'translateY(8px)', opacity: 0 },
          to: { transform: 'translateY(0)', opacity: 1 }
        },
        fadeIn: {
          from: { opacity: 0 },
          to: { opacity: 1 }
        },
      },
    },

    // ✅ optional layout improvement
    container: {
      center: true,
      padding: '1rem',
    },
  },

  plugins: [],
};