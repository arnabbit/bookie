import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Text, View } from 'react-native';
import React from 'react';

function TabIcon({ name, size }: { name: string; size: number }) {
  if (Platform.OS === 'web') {
    const emojiMap: Record<string, string> = {
      'book-outline': '📖',
      'library-outline': '📖',
      'people': '👥',
      'person-circle': '👤',
    };
    return <Text style={{ fontSize: size }}>{emojiMap[name] || '📄'}</Text>;
  }
  return <Ionicons name={name as any} size={size} color={'#999'} />;
}

function TabIconActive({ name, size }: { name: string; size: number }) {
  if (Platform.OS === 'web') {
    const emojiMap: Record<string, string> = {
      'book-outline': '📖',
      'library-outline': '📖',
      'people': '👥',
      'person-circle': '👤',
    };
    return <Text style={{ fontSize: size }}>{emojiMap[name] || '📄'}</Text>;
  }
  return <Ionicons name={name as any} size={size} color={'#6366f1'} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#eee',
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
      }}>
      <Tabs.Screen
        name="books"
        options={{
          title: 'Books',
          tabBarIcon: ({ color, size, focused }) => (
            focused
              ? <TabIconActive name="book-outline" size={size} />
              : <TabIcon name="book-outline" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Social',
          tabBarIcon: ({ color, size, focused }) => (
            focused
              ? <TabIconActive name="people" size={size} />
              : <TabIcon name="people" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            focused
              ? <TabIconActive name="person-circle" size={size} />
              : <TabIcon name="person-circle" size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
