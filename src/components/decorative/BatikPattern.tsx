// src/components/decorative/BatikPattern.tsx
import React from 'react';
import { StyleSheet, UIManager, View } from 'react-native';

let SvgModule: any = null;
try {
  const hasSvgNative = !!(
    UIManager.getViewManagerConfig('RNSVGSvgView') ||
    UIManager.getViewManagerConfig('RNSVGRect')
  );
  if (hasSvgNative) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SvgModule = require('react-native-svg');
  }
} catch {
  SvgModule = null;
}

type BatikPatternProps = {
  opacity?: number;
  color?: string;
  style?: any;
};

/**
 * Batik Kawung geometric pattern for Indonesian aesthetic.
 * Automatically checks native module presence; falls back gracefully if not compiled yet.
 */
export const BatikPattern: React.FC<BatikPatternProps> = ({
  opacity = 0.08,
  color = '#FFFFFF',
  style,
}) => {
  if (!SvgModule) {
    return null;
  }

  const { Svg, Pattern, G, Ellipse, Rect } = SvgModule;

  return (
    <View style={[StyleSheet.absoluteFill, styles.container, style]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Pattern
          id="kawungPattern"
          width="60"
          height="60"
          patternUnits="userSpaceOnUse"
        >
          <G fill={color} opacity={opacity}>
            {/* Center petals */}
            <Ellipse cx="30" cy="30" rx="6" ry="12" transform="rotate(45 30 30)" />
            <Ellipse cx="30" cy="30" rx="6" ry="12" transform="rotate(-45 30 30)" />

            {/* Corner petals */}
            <Ellipse cx="0" cy="0" rx="6" ry="12" transform="rotate(45 0 0)" />
            <Ellipse cx="0" cy="0" rx="6" ry="12" transform="rotate(-45 0 0)" />

            <Ellipse cx="60" cy="0" rx="6" ry="12" transform="rotate(45 60 0)" />
            <Ellipse cx="60" cy="0" rx="6" ry="12" transform="rotate(-45 60 0)" />

            <Ellipse cx="0" cy="60" rx="6" ry="12" transform="rotate(45 0 60)" />
            <Ellipse cx="0" cy="60" rx="6" ry="12" transform="rotate(-45 0 60)" />

            <Ellipse cx="60" cy="60" rx="6" ry="12" transform="rotate(45 60 60)" />
            <Ellipse cx="60" cy="60" rx="6" ry="12" transform="rotate(-45 60 60)" />
          </G>
        </Pattern>
        <Rect width="100%" height="100%" fill="url(#kawungPattern)" />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
