import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, View, Text } from 'react-native';
import React from 'react';
import { BlurView } from 'expo-blur';
import { colors, fonts } from '@/lib/theme';

function TabBarBackground() {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
    );
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(252,249,244,0.92)' }]} />;
}

function TabIcon({ name, focused }: { name: keyof typeof Ionicons.glyphMap; focused: boolean }) {
  return (
    <View style={focused ? styles.activeIconWrap : styles.inactiveIconWrap}>
      <Ionicons
        name={name}
        size={22}
        color={focused ? colors.onSurface : colors.onSurfaceVariant + '99'}
      />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.onSurface,
        tabBarInactiveTintColor: colors.onSurfaceVariant + '99',
        tabBarLabelStyle: {
          fontFamily: fonts.bodyBold,
          fontSize: 9,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          marginTop: -2,
        },
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 80 : 64,
          elevation: 0,
          ...Platform.select({
            ios: {
              shadowColor: colors.onSurface,
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.04,
              shadowRadius: 24,
            },
            default: {},
          }),
        },
        tabBarBackground: () => <TabBarBackground />,
      }}>
      <Tabs.Screen
        name="books"
        options={{
          title: 'Library',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'book' : 'book-outline'} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Social',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'people' : 'people-outline'} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  activeIconWrap: {
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  inactiveIconWrap: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
});
