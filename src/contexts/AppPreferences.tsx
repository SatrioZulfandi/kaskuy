import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, useColorScheme, View } from 'react-native';
import { Colors } from '../constants/theme';
import { getAppPreferences, setAppPreference, type ThemePreference } from '../db/repositories/settingsRepo';

type Preferences = {
  theme: ThemePreference;
  colorScheme: 'light' | 'dark';
  onboardingCompleted: boolean;
  setTheme: (theme: ThemePreference) => Promise<void>;
  completeOnboarding: () => Promise<void>;
};

const PreferencesContext = createContext<Preferences | null>(null);

export function AppPreferencesProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, updateTheme] = useState<ThemePreference>('system');
  const [onboardingCompleted, setCompleted] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    getAppPreferences().then((preferences) => {
      if (!active) return;
      updateTheme(preferences.theme);
      setCompleted(preferences.onboardingCompleted);
      setReady(true);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);
  const setTheme = useCallback(async (value: ThemePreference) => {
    await setAppPreference('theme', value);
    updateTheme(value);
  }, []);
  const completeOnboarding = useCallback(async () => {
    await setAppPreference('onboarding_completed', '1');
    setCompleted(true);
  }, []);
  const colorScheme = theme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : theme;
  const value = useMemo(() => ({ theme, colorScheme, onboardingCompleted, setTheme, completeOnboarding }),
    [theme, colorScheme, onboardingCompleted, setTheme, completeOnboarding]);
  if (!ready) {
    const colors = Colors[colorScheme];
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: colors.background, padding: 24 }}>
        {error ? <>
          <Text style={{ color: colors.text }}>Pengaturan belum dapat dimuat.</Text>
          <Pressable accessibilityRole="button" onPress={() => { setError(false); setAttempt((count) => count + 1); }} style={{ padding: 16 }}>
            <Text style={{ color: colors.primary }}>Coba Lagi</Text>
          </Pressable>
        </> : <ActivityIndicator color={colors.primary} />}
      </View>
    );
  }
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useAppPreferences(): Preferences {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error('Pengaturan aplikasi belum tersedia.');
  return preferences;
}
