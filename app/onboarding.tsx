import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts } from '@/lib/theme';

export const ONBOARDING_SEEN_KEY = 'retold_onboarding_seen_v1';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: 'sparkles-outline' as const,
    title: 'Retellings, not the books',
    body: 'Every story here is our short, swipeable retelling — a quick way to meet a book. It is not the original text, and we always point you to it.',
  },
  {
    icon: 'flame-outline' as const,
    title: 'A page a day',
    body: 'Read a little each day and keep your streak alive. Small and steady rebuilds the habit — no marathons required.',
  },
  {
    icon: 'book-outline' as const,
    title: 'Then read it for real',
    body: 'When a retelling grabs you, grab the real book. Retold is the on-ramp; the paperback is the destination.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  const finish = async () => {
    try { await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1'); } catch { /* ignore */ }
    router.replace('/(tabs)/books' as any);
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      const target = index + 1;
      listRef.current?.scrollToIndex({ index: target, animated: true });
      setIndex(target);
    } else {
      finish();
    }
  };

  const onViewable = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setIndex(viewableItems[0].index);
    }
  }).current;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={finish} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.title}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={56} color={colors.tertiary} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <TouchableOpacity style={styles.cta} onPress={next} activeOpacity={0.9}>
        <Text style={styles.ctaText}>{index === SLIDES.length - 1 ? 'Start reading' : 'Next'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: 8 },
  skip: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.onSurfaceVariant },
  slide: {
    width,
    paddingHorizontal: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  iconWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.tertiary + '1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 28,
    color: colors.onSurface,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceContainerHighest,
  },
  dotActive: { backgroundColor: colors.tertiary, width: 22 },
  cta: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: '700',
    color: colors.onPrimary,
    letterSpacing: 0.3,
  },
});
