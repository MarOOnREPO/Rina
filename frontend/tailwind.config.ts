import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        rina: {
          bg: '#0f0f1a',
          surface: '#16162a',
          glass: 'rgba(255, 255, 255, 0.06)',
          'glass-strong': 'rgba(255, 255, 255, 0.12)',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-strong': 'rgba(255, 255, 255, 0.15)',
          rose: '#fb7185',
          'rose-soft': 'rgba(251, 113, 133, 0.2)',
          indigo: '#818cf8',
          'indigo-soft': 'rgba(129, 140, 248, 0.2)',
          slate: '#94a3b8',
          'slate-dark': '#475569'
        }
      },
      backdropBlur: {
        glass: '20px'
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' }
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(251, 113, 133, 0.3)' },
          '100%': { boxShadow: '0 0 25px rgba(251, 113, 133, 0.6)' }
        }
      }
    }
  },
  plugins: []
};

export default config;
