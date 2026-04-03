import { Ionicons } from '@expo/vector-icons';
import { DefaultTheme, ThemeProvider, Theme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/lib/AuthContext';

const AtelierTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#fcf9f4',
    card: '#fcf9f4',
    text: '#1c1c19',
    border: 'rgba(196,198,204,0.15)',
    primary: '#705d00',
  },
};

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

    const inAuthGroup = segments[0] === ('auth' as any);

    if (!token && !inAuthGroup) {
      router.replace('/auth/login' as any);
    } else if (token && inAuthGroup) {
      router.replace('/(tabs)/books' as any);
    }
  }, [user, token, isLoading, segments]);

  if (isLoading) return null;

  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    ...Ionicons.font,
    'NotoSerif-Regular': require('../assets/fonts/NotoSerif-Regular.ttf'),
    'NotoSerif-Bold': require('../assets/fonts/NotoSerif-Bold.ttf'),
    'NotoSerif-Italic': require('../assets/fonts/NotoSerif-Italic.ttf'),
    'NotoSerif-BoldItalic': require('../assets/fonts/NotoSerif-BoldItalic.ttf'),
    'Manrope-Regular': require('../assets/fonts/Manrope-Regular.ttf'),
    'Manrope-Medium': require('../assets/fonts/Manrope-Medium.ttf'),
    'Manrope-SemiBold': require('../assets/fonts/Manrope-SemiBold.ttf'),
    'Manrope-Bold': require('../assets/fonts/Manrope-Bold.ttf'),
    'Manrope-ExtraBold': require('../assets/fonts/Manrope-ExtraBold.ttf'),
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
    <ThemeProvider value={AtelierTheme}>
      <AuthProvider>
        <AuthGuard>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="chat" options={{ headerShown: false }} />
            <Stack.Screen name="conversations" options={{ headerShown: false }} />
            <Stack.Screen name="book-picker" options={{ headerShown: true, title: 'Share Page', presentation: 'modal' }} />
            <Stack.Screen name="admin" options={{ headerShown: false }} />
          </Stack>
        </AuthGuard>
      </AuthProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
