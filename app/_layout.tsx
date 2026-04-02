import { Ionicons } from '@expo/vector-icons';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/lib/AuthContext';

if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync();
}

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, token, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!token && !inAuthGroup) {
      router.replace('/auth/login');
    } else if (token && inAuthGroup) {
      router.replace('/(tabs)/books');
    }
  }, [user, token, isLoading, segments]);

  if (isLoading) return null;

  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    ...Ionicons.font,
  });
  const [fontReady, setFontReady] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS === 'web' && loaded) {
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
    <ThemeProvider value={DefaultTheme}>
      <AuthProvider>
        <AuthGuard>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="chat" options={{ headerShown: false }} />
            <Stack.Screen name="conversations" options={{ headerShown: false }} />
            <Stack.Screen name="book-picker" options={{ headerShown: true, title: 'Share Page', presentation: 'modal' }} />
          </Stack>
        </AuthGuard>
      </AuthProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
