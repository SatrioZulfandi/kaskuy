// src/constants/theme.ts
import { Platform } from 'react-native';

export const Colors = {
  light: {
    primary: '#0066FF',
    primaryDark: '#0052CC',
    primaryLight: '#EBF3FF',
    gradientStart: '#0052CC',
    gradientEnd: '#3B82F6',
    background: '#F5F7FA',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    text: '#1A1A2E',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    success: '#00C48C',
    successLight: '#E6F9F3',
    danger: '#FF4757',
    dangerLight: '#FFEAEA',
    warning: '#F59E0B',
    warningLight: '#FEF3C7',
    tabBarBg: '#FFFFFF',
    tabBarBorder: '#E5E7EB',
    tabBarInactive: '#9CA3AF',
    scanGlow: 'rgba(0, 102, 255, 0.35)',

    // Legacy template compatibility
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
  },
  dark: {
    primary: '#3B82F6',
    primaryDark: '#1D4ED8',
    primaryLight: '#1E293B',
    gradientStart: '#1E40AF',
    gradientEnd: '#3B82F6',
    background: '#0B0F19',
    surface: '#151C2C',
    surfaceElevated: '#1E293B',
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    textMuted: '#6B7280',
    border: '#1F2937',
    borderLight: '#111827',
    success: '#34D399',
    successLight: '#064E3B',
    danger: '#F87171',
    dangerLight: '#7F1D1D',
    warning: '#FBBF24',
    warningLight: '#78350F',
    tabBarBg: '#151C2C',
    tabBarBorder: '#1F2937',
    tabBarInactive: '#6B7280',
    scanGlow: 'rgba(59, 130, 246, 0.45)',

    // Legacy template compatibility
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
  },
} as const;

export type ThemeColors = typeof Colors.light;
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  full: 9999,
};

export const Spacing = {
  // Legacy numeric word keys
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,

  // Semantic t-shirt keys
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const Typography = {
  header: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  title: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500' as const,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
  },
  amountLarge: {
    fontSize: 26,
    fontWeight: '700' as const,
  },
  amountMedium: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
};
