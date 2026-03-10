/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'f1-red': '#E10600',
        'f1-black': '#15151E',
        'f1-white': '#FFFFFF',
        'f1-gray': '#38383F',
        'f1-silver': '#C0C0C0',
        'carbon': {
          950: '#080808',
          900: '#0D0D0D',
          800: '#1A1A1A',
          700: '#262626',
          600: '#333333',
          500: '#404040',
          400: '#525252',
        },
        'racing-red': {
          400: '#FF3B36',
          500: '#E10600',
          600: '#B30500',
          700: '#8A0400',
          800: '#5C0300',
          900: '#2E0100',
        },
        'track': { green: '#00D94F', yellow: '#FFD700', blue: '#00B8FF' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Rajdhani', 'sans-serif'],
      },
      animation: {
        'fade-in':        'fadeIn 0.5s ease-out both',
        'fade-in-up':     'fadeInUp 0.6s ease-out both',
        'slide-up':       'slideUp 0.5s ease-out',
        'slide-in-left':  'slideInLeft 0.5s ease-out both',
        'slide-in-right': 'slideInRight 0.5s ease-out both',
        'pulse-slow':     'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'shimmer':        'shimmer 2.2s infinite',
        'float':          'float 6s ease-in-out infinite',
        'glow':           'glow 2s ease-in-out infinite alternate',
        'spin-slow':      'spin 10s linear infinite',
        'bounce-subtle':  'bounceSubtle 2s ease-in-out infinite',
        'width-expand':   'widthExpand 0.8s ease-out both',
      },
      keyframes: {
        fadeIn:       { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeInUp:     { '0%': { opacity: '0', transform: 'translateY(28px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideUp:      { '0%': { transform: 'translateY(20px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        slideInLeft:  { '0%': { opacity: '0', transform: 'translateX(-28px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        slideInRight: { '0%': { opacity: '0', transform: 'translateX(28px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        shimmer: {
          '0%':   { backgroundPosition: '-400% 0' },
          '100%': { backgroundPosition: '400% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-14px)' },
        },
        glow: {
          '0%':   { boxShadow: '0 0 4px rgba(225,6,0,0.2), 0 0 8px rgba(225,6,0,0.1)' },
          '100%': { boxShadow: '0 0 16px rgba(225,6,0,0.7), 0 0 32px rgba(225,6,0,0.3)' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-5px)' },
        },
        widthExpand: {
          '0%':   { width: '0%', opacity: '0' },
          '100%': { width: '100%', opacity: '1' },
        },
      },
      boxShadow: {
        'red-glow':    '0 0 20px rgba(225,6,0,0.45)',
        'red-glow-lg': '0 0 40px rgba(225,6,0,0.35), 0 0 80px rgba(225,6,0,0.15)',
        'card':        '0 4px 24px rgba(0,0,0,0.5)',
        'card-hover':  '0 8px 40px rgba(0,0,0,0.7)',
      },
    },
  },
  plugins: [],
}
