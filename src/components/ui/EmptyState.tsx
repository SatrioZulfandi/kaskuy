// src/components/ui/EmptyState.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../../constants/theme';
import { useTheme, useThemedStyles } from '../../hooks/use-theme';
import { BatikPattern } from '../decorative/BatikPattern';
import { Icon, type IconName } from './Icon';

type EmptyStateProps = {
  icon?: IconName;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'wallet',
  title,
  subtitle,
  action,
}) => {
  const colors = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      <BatikPattern opacity={0.07} color={colors.primary} />
      <View style={styles.iconCircle}>
        <Icon name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    position: 'relative',
    marginVertical: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  action: {
    marginTop: 16,
  },
});

