// src/lib/haptics.ts
import * as ExpoHaptics from 'expo-haptics';

export const ImpactFeedbackStyle = ExpoHaptics.ImpactFeedbackStyle;
export const NotificationFeedbackType = ExpoHaptics.NotificationFeedbackType;

/**
 * Safe Haptics wrapper that prevents unhandled rejections
 * on Android development builds where native expo-haptics is not linked yet.
 */
export const Haptics = {
  ImpactFeedbackStyle,
  NotificationFeedbackType,

  impactAsync: async (style?: ExpoHaptics.ImpactFeedbackStyle) => {
    try {
      await ExpoHaptics.impactAsync(style);
    } catch {
      // Gracefully no-op if native module is unavailable in current APK
    }
  },

  notificationAsync: async (type?: ExpoHaptics.NotificationFeedbackType) => {
    try {
      await ExpoHaptics.notificationAsync(type);
    } catch {
      // Gracefully no-op if native module is unavailable in current APK
    }
  },

  selectionAsync: async () => {
    try {
      await ExpoHaptics.selectionAsync();
    } catch {
      // Gracefully no-op if native module is unavailable in current APK
    }
  },
};

