import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          925: '#0d1220',
          950: '#020817',
        },
        emerald: {
          450: '#34d87a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
        sidebar: '14rem',
        'sidebar-collapsed': '3.5rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.4)',
        'card-elevated':
          '0 4px 6px -1px rgb(0 0 0 / 0.5), 0 2px 4px -2px rgb(0 0 0 / 0.5)',
        'card-hover':
          '0 10px 15px -3px rgb(0 0 0 / 0.5), 0 4px 6px -4px rgb(0 0 0 / 0.5)',
        'glow-emerald': '0 0 20px -2px rgb(16 185 129 / 0.4)',
        'glow-rose': '0 0 20px -2px rgb(244 63 94 / 0.4)',
        'glow-amber': '0 0 20px -2px rgb(245 158 11 / 0.4)',
        'inner-glow': 'inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
        focus: '0 0 0 2px rgb(16 185 129 / 0.6)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px 0 rgb(16 185 129 / 0.4)' },
          '50%': { boxShadow: '0 0 20px 4px rgb(16 185 129 / 0.7)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(1.5)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'draw-arc': {
          '0%': { strokeDashoffset: '251.2' },
          '100%': { strokeDashoffset: 'var(--arc-offset, 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-in-up': 'fade-in-up 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
        'slide-in-left': 'slide-in-left 0.25s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 1.5s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
        'spin-slow': 'spin-slow 1.2s linear infinite',
        'scale-in': 'scale-in 0.15s ease-out',
        'draw-arc': 'draw-arc 1s ease-out forwards',
      },
      backgroundImage: {
        'shimmer-gradient':
          'linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.05) 50%, transparent 100%)',
        'card-gradient':
          'linear-gradient(135deg, rgb(15 23 42 / 0.8) 0%, rgb(2 8 23 / 0.9) 100%)',
        'emerald-gradient':
          'linear-gradient(135deg, rgb(16 185 129 / 1) 0%, rgb(5 150 105 / 1) 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
