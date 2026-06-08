import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        rina: {
          // Primary palette — Romance Rose
          primary: '#BE185D',
          'primary-light': '#EC4899',
          'primary-soft': 'rgba(190, 24, 93, 0.08)',
          'primary-medium': 'rgba(190, 24, 93, 0.15)',
          'primary-glow': 'rgba(190, 24, 93, 0.25)',

          // Secondary — Soft Pink
          secondary: '#EC4899',
          'secondary-soft': 'rgba(236, 72, 153, 0.12)',

          // Accent — Love Red
          accent: '#DC2626',
          'accent-soft': 'rgba(220, 38, 38, 0.08)',

          // Backgrounds
          bg: '#FDF2F8',
          'bg-warm': '#FBF1F5',
          'bg-card': '#FFFFFF',
          'bg-elevated': '#FFFFFF',

          // Surfaces
          surface: '#FFFFFF',
          'surface-warm': '#FEF7FA',
          'surface-muted': '#FBF1F5',

          // Glassmorphism (subtle on light)
          glass: 'rgba(255, 255, 255, 0.72)',
          'glass-strong': 'rgba(255, 255, 255, 0.92)',
          'glass-rose': 'rgba(253, 242, 248, 0.85)',

          // Borders
          border: '#F7E3EB',
          'border-strong': '#FBCFE8',
          'border-subtle': 'rgba(190, 24, 93, 0.08)',

          // Text
          text: '#0F172A',
          'text-secondary': '#475569',
          'text-muted': '#64748B',
          'text-inverse': '#FFFFFF',

          // Utility
          slate: '#64748B',
          'slate-light': '#94A3B8',
          'slate-dark': '#334155',

          // Status
          success: '#059669',
          'success-soft': '#ECFDF5',
          warning: '#D97706',
          'warning-soft': '#FFFBEB',
          error: '#DC2626',
          'error-soft': '#FEF2F2',

          // Gradients
          rose: '#BE185D',
          'rose-soft': 'rgba(190, 24, 93, 0.1)',
          indigo: '#7C3AED',
          'indigo-soft': 'rgba(124, 58, 237, 0.1)',
        }
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(190, 24, 93, 0.06)',
        'soft-lg': '0 4px 16px rgba(190, 24, 93, 0.08)',
        'soft-xl': '0 8px 32px rgba(190, 24, 93, 0.1)',
        'card': '0 2px 12px rgba(15, 23, 42, 0.06)',
        'card-hover': '0 8px 24px rgba(15, 23, 42, 0.1)',
        'glow': '0 0 20px rgba(190, 24, 93, 0.2)',
        'glow-strong': '0 0 30px rgba(190, 24, 93, 0.3)',
        'inner-soft': 'inset 0 2px 4px rgba(190, 24, 93, 0.04)',
      },
      backdropBlur: {
        'glass': '16px',
        'glass-lg': '24px',
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
        '300': '300ms',
        '400': '400ms',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'heart-beat': 'heartBeat 1.2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(190, 24, 93, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(190, 24, 93, 0.4)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        heartBeat: {
          '0%, 100%': { transform: 'scale(1)' },
          '14%': { transform: 'scale(1.15)' },
          '28%': { transform: 'scale(1)' },
          '42%': { transform: 'scale(1.15)' },
          '70%': { transform: 'scale(1)' },
        },
      },
    }
  },
  plugins: []
};

export default config;
