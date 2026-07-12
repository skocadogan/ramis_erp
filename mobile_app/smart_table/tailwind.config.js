/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontSize: {
        'xs': ['10px', { lineHeight: '12px' }],    // Varsayılan: 12px
        'sm': ['12px', { lineHeight: '16px' }],    // Varsayılan: 14px
        'base': ['13px', { lineHeight: '20px' }],  // Varsayılan: 16px
        'lg': ['15px', { lineHeight: '22px' }],    // Varsayılan: 18px
        'xl': ['17px', { lineHeight: '24px' }],    // Varsayılan: 20px
        '2xl': ['20px', { lineHeight: '26px' }],   // Varsayılan: 24px
        '3xl': ['26px', { lineHeight: '32px' }],   // Varsayılan: 30px
      },
      colors: {
        // RAMIS Design System v2 — Gerçek renk çiftleri (CSS var() yerine)
        // NativeWind dark: prefix doğru çalışması için statik değerler gereklidir.
        background: {
          DEFAULT: '#FAFAFA',
          dark: '#0F0F1A',
        },
        foreground: {
          DEFAULT: '#1A1A2E',
          dark: '#EDEDED',
        },
        card: {
          DEFAULT: '#FFFFFF',
          dark: '#1A1A2E',
        },
        'card-foreground': {
          DEFAULT: '#1A1A2E',
          dark: '#EDEDED',
        },
        popover: {
          DEFAULT: '#FFFFFF',
          dark: '#1A1A2E',
        },
        'popover-foreground': {
          DEFAULT: '#1A1A2E',
          dark: '#EDEDED',
        },
        primary: {
          DEFAULT: '#D94A3D',
          dark: '#E85D04',
          foreground: '#FFFFFF',
        },
        'primary-foreground': '#FFFFFF',
        secondary: {
          DEFAULT: '#2B2D42',
          dark: '#EDEDED',
          foreground: '#FFFFFF',
        },
        'secondary-foreground': {
          DEFAULT: '#FFFFFF',
          dark: '#1A1A2E',
        },
        muted: {
          DEFAULT: '#F0F0F0',
          dark: '#2B2D42',
        },
        'muted-foreground': {
          DEFAULT: '#6B7280',
          dark: '#9CA3AF',
        },
        accent: {
          DEFAULT: '#F5E6D3',
          dark: '#2B2D42',
          foreground: '#2B2D42',
        },
        'accent-foreground': {
          DEFAULT: '#2B2D42',
          dark: '#EDEDED',
        },
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#FFFFFF',
        },
        'destructive-foreground': '#FFFFFF',
        success: {
          DEFAULT: '#059669',
          foreground: '#FFFFFF',
        },
        'success-foreground': '#FFFFFF',
        warning: {
          DEFAULT: '#F59E0B',
          foreground: '#FFFFFF',
        },
        'warning-foreground': '#FFFFFF',
        border: {
          DEFAULT: '#E5E7EB',
          dark: '#2B2D42',
        },
        input: {
          DEFAULT: '#E5E7EB',
          dark: '#2B2D42',
        },
        ring: {
          DEFAULT: '#D94A3D',
          dark: '#E85D04',
        },
      },
      borderRadius: {
        DEFAULT: '16px',
      },
    },
  },
  plugins: [],
};
