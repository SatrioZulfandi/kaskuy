// src/hooks/useTopInset.ts
import { Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Returns safe top padding that clears Android/iOS status bars, notches, and camera hole-punches.
 * @param extraPadding additional spacing below the status bar (default 12px)
 */
export function useTopInset(extraPadding = 12): number {
  const insets = useSafeAreaInsets();
  const statusBarHeight = StatusBar.currentHeight ?? 0;

  // On modern Android with hole-punch / edge-to-edge, insets.top or statusBarHeight is typically 32-44px.
  // Fall back to a minimum of 36px on Android and 24px on iOS if neither is reported.
  const baseInset = Math.max(
    insets.top,
    statusBarHeight,
    Platform.OS === 'android' ? 36 : 24
  );

  return baseInset + extraPadding;
}

