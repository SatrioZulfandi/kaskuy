// src/components/navigation/CustomTabBar.tsx
import { router } from 'expo-router';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ThemeColors } from '../../constants/theme';
import { useTheme, useThemedStyles } from '../../hooks/use-theme';
import { Haptics } from '../../lib/haptics';
import { Icon } from '../ui/Icon';

export type CustomTabBarProps = {
  state: any;
  navigation: any;
  descriptors?: any;
  insets?: any;
};

type TabDefinition = {
  name: string;
  label: string;
  icon: string;
};

const LEFT_TABS: TabDefinition[] = [
  { name: 'index', label: 'Beranda', icon: 'home' },
  { name: 'wallet', label: 'Dompet', icon: 'wallet' },
];

const RIGHT_TABS: TabDefinition[] = [
  { name: 'report', label: 'Laporan', icon: 'chart' },
  { name: 'settings', label: 'Pengaturan', icon: 'settings' },
];

export const CustomTabBar: React.FC<CustomTabBarProps> = ({ state, navigation }) => {
  const colors = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const currentRouteName = state.routes[state.index]?.name;

  const handleTabPress = (routeName: string, isFocused: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore
    }

    const event = navigation.emit({
      type: 'tabPress',
      target: state.routes.find((route: { name: string }) => route.name === routeName)?.key ?? routeName,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  const handleScanPress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Ignore
    }
    // Navigate to scan screen
    router.push('/scan' as any);
  };

  const renderTabItem = (item: TabDefinition) => {
    const isFocused = currentRouteName === item.name;
    const color = isFocused ? colors.primary : colors.tabBarInactive;

    return (
      <Pressable
        key={item.name}
        accessibilityRole="tab"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: isFocused }}
        onPress={() => handleTabPress(item.name, isFocused)}
        onLongPress={() => navigation.emit({
          type: 'tabLongPress',
          target: state.routes.find((route: { name: string }) => route.name === item.name)?.key ?? item.name,
        })}
        style={styles.tabItem}
      >
        <Icon
          name={item.icon}
          size={23}
          color={color}
          strokeWidth={isFocused ? 2.1 : 1.7}
        />
        <Text
          style={[
            styles.tabLabel,
            {
              color,
              fontWeight: isFocused ? '600' : '500',
            },
          ]}
        >
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.tabBar}>
        {/* Left tabs: Beranda, Dompet */}
        <View style={styles.sideTabs}>
          {LEFT_TABS.map(renderTabItem)}
        </View>

        {/* Center Space for Raised Scan Button */}
        <View style={styles.centerSpace} />

        {/* Right tabs: Laporan, Pengaturan */}
        <View style={styles.sideTabs}>
          {RIGHT_TABS.map(renderTabItem)}
        </View>
      </View>

      {/* Raised Center Scan Button */}
      <View style={styles.raisedButtonAnchor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan struk"
          onPress={handleScanPress}
          style={({ pressed }) => [
            styles.raisedButtonContainer,
            pressed && styles.raisedButtonPressed,
          ]}
        >
          <View style={styles.raisedButton}>
            <Icon name="scan" size={26} color="#FFFFFF" strokeWidth={2.2} />
          </View>
        </Pressable>
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  wrapper: {
    backgroundColor: colors.tabBarBg,
    borderTopWidth: 1,
    borderTopColor: colors.tabBarBorder,
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    paddingHorizontal: 8,
  },
  sideTabs: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  centerSpace: {
    width: 70,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  tabLabel: {
    fontSize: 11,
  },
  raisedButtonAnchor: {
    position: 'absolute',
    top: -26,
    left: '50%',
    marginLeft: -29,
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  raisedButtonContainer: {
    width: 58,
    height: 58,
    borderRadius: 29,
    ...Platform.select({
      ios: {
        shadowColor: '#1B365D',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  raisedButtonPressed: {
    transform: [{ scale: 0.94 }],
  },
  raisedButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B365D',
    borderWidth: 3.5,
    borderColor: '#FFFFFF',
  },
});
