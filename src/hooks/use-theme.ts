/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useMemo } from 'react';
import { Colors, type ThemeColors } from '@/constants/theme';
import { useAppPreferences } from '@/contexts/AppPreferences';

export function useTheme() {
  return Colors[useAppPreferences().colorScheme];
}

export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const colors = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
