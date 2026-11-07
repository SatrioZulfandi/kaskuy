// src/components/ui/LinearGradient.tsx
import React from 'react';
import { UIManager, View, type ViewProps, type ViewStyle } from 'react-native';
import { Colors } from '../../constants/theme';

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
  colors = [Colors.light.gradientStart, Colors.light.gradientEnd],
  style,
  children,
  ...rest
}) => {
  if (NativeLinearGradient) {
    return (
      <NativeLinearGradient colors={colors} style={style} {...rest}>
        {children}
      </NativeLinearGradient>
    );
  }

  // Graceful fallback for dev clients without expo-linear-gradient compiled in
  const bgColor = colors[0] || Colors.light.primaryDark;
  return (
    <View style={[{ backgroundColor: bgColor }, style]} {...rest}>
      {children}
    </View>
  );
};

