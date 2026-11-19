// src/components/ui/LinearGradient.tsx
import React from 'react';
import { UIManager, View, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/use-theme';

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
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
};

export const LinearGradient: React.FC<LinearGradientProps> = ({
  colors: gradientColors,
  style,
  children,
  ...rest
}) => {
  const colors = useTheme();
  const gradient = gradientColors ?? [colors.gradientStart, colors.gradientEnd];
  if (NativeLinearGradient) {
    return (
      <NativeLinearGradient colors={gradient} style={style} {...rest}>
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

