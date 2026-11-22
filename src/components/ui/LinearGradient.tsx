// src/components/ui/LinearGradient.tsx
import React from 'react';
import { UIManager, View, type ViewProps } from 'react-native';
import { Colors } from '../../constants/theme';
import { useAppPreferences } from '../../contexts/AppPreferences';

let NativeLinearGradient: any = null;
try {
  const hasNative = !!(
    UIManager.getViewManagerConfig('ViewManagerAdapter_ExpoLinearGradient') ||
    UIManager.getViewManagerConfig('RCTViewManagerAdapter_ExpoLinearGradient') ||
    UIManager.getViewManagerConfig('ExpoLinearGradient')
  );
  if (hasNative) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    NativeLinearGradient = require('expo-linear-gradient').LinearGradient;
  }
} catch {
  NativeLinearGradient = null;
}

type LinearGradientProps = ViewProps & {
  colors?: readonly [string, string, ...string[]] | string[];
  variant?: 'header';
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  children?: React.ReactNode;
};

export const LinearGradient: React.FC<LinearGradientProps> = ({
  colors: gradientColors,
  variant,
  start,
  end,
  style,
  children,
  ...rest
}) => {
  const { colorScheme } = useAppPreferences();
  const colors = Colors[colorScheme];
  const darkHeader = variant === 'header' && colorScheme === 'dark';
  const themeGradient = [colors.gradientStart, colors.gradientEnd];
  const gradient = darkHeader ? themeGradient : gradientColors ?? themeGradient;
  if (NativeLinearGradient) {
    return (
      <NativeLinearGradient
        colors={gradient}
        start={darkHeader ? { x: 0, y: 0 } : start}
        end={darkHeader ? { x: 0, y: 1 } : end}
        style={style}
        {...rest}
      >
        {children}
      </NativeLinearGradient>
    );
  }

  // Graceful fallback for dev clients without expo-linear-gradient compiled in
  const bgColor = gradient[0] || colors.primaryDark;
  return (
    <View style={[{ backgroundColor: bgColor }, style]} {...rest}>
      {children}
    </View>
  );
};

