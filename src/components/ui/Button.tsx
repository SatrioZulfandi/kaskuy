// src/components/ui/Button.tsx
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Radius, type ThemeColors } from '../../constants/theme';
import { useTheme, useThemedStyles } from '../../hooks/use-theme';
import { Haptics } from '../../lib/haptics';
import { LinearGradient } from './LinearGradient';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
};

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
}) => {
  const colors = useTheme();
  const styles = useThemedStyles(createStyles);
  const variantStyles = useThemedStyles(createVariantStyles);
  const handlePress = () => {
    if (disabled || loading) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore if haptics fail
    }
    onPress();
  };

  const isGradient = variant === 'primary';

  const content = (
    <>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'secondary' ? colors.primary : '#FFFFFF'}
          style={styles.spinner}
        />
      ) : (
        <>
          {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
          <Text
            style={[
              styles.text,
              size === 'sm' && styles.textSm,
              size === 'lg' && styles.textLg,
              variant === 'outline' && styles.textOutline,
              variant === 'secondary' && styles.textSecondary,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </>
  );

  if (isGradient) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        onPress={handlePress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.pressable,
          pressed && styles.pressed,
          disabled && styles.disabled,
          style,
        ]}
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.container, sizeStyles[size]]}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.pressable,
        styles.container,
        sizeStyles[size],
        variantStyles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
};

const sizeStyles = {
  sm: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
  },
  md: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: Radius.md,
  },
  lg: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: Radius.lg,
  },
};

const createVariantStyles = (colors: ThemeColors) => ({
  primary: {},
  secondary: {
    backgroundColor: colors.primaryLight,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  danger: {
    backgroundColor: colors.danger,
  },
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  pressable: {
    overflow: 'hidden',
    borderRadius: Radius.md,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.5,
  },
  spinner: {
    marginRight: 8,
  },
  iconWrap: {
    marginRight: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  textSm: {
    fontSize: 13,
  },
  textLg: {
    fontSize: 17,
  },
  textOutline: {
    color: colors.primary,
  },
  textSecondary: {
    color: colors.primary,
  },
});
