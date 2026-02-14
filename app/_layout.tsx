import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { BooksProvider } from '@/lib/BooksContext';

if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync();
}

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    ...Ionicons.font,
  });
  const [fontReady, setFontReady] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS === 'web' && loaded) {
      // On Safari/iOS/Firefox, expo-font resolves immediately before the font
      // is actually available. Wait for document.fonts to confirm readiness.
      document.fonts.ready.then(() => setFontReady(true));
    }
  }, [loaded]);

  useEffect(() => {
    if (loaded && Platform.OS !== 'web') {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded || !fontReady) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <BooksProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="add-book" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="help" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
      </BooksProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
