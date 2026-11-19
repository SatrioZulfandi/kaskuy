// src/components/ui/Card.tsx
import React from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { Radius, type ThemeColors } from '../../constants/theme';
import { useThemedStyles } from '../../hooks/use-theme';

type CardProps = ViewProps & {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  elevated?: boolean;
};

export const Card: React.FC<CardProps> = ({
  children,
  style,
  elevated = true,
  ...rest
}) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={[
        styles.base,
        elevated ? styles.elevated : styles.flat,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: 16,
  },
  elevated: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  flat: {
    borderWidth: 1,
    borderColor: colors.border,
  },
});

