import React from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, shadows } from '@/lib/theme';

interface Props {
  visible: boolean;
  bookTitle: string;
  streakCurrent?: number;
  purchaseUrl?: string;
  onClose: () => void;
}

// Full-screen celebration shown when a reader finishes a retelling. The primary
// action hands the reader off to the real book.
export default function CompletionCelebration({
  visible,
  bookTitle,
  streakCurrent,
  purchaseUrl,
  onClose,
}: Props) {
  const getTheRealBook = () => {
    if (purchaseUrl) Linking.openURL(purchaseUrl).catch(() => {});
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.badge}>
            <Ionicons name="checkmark-circle" size={56} color={colors.tertiary} />
          </View>

          <Text style={styles.kicker}>Retelling complete</Text>
          <Text style={styles.title}>You finished the retelling of {bookTitle}</Text>

          {typeof streakCurrent === 'number' && streakCurrent > 0 && (
            <View style={styles.streakRow}>
              <Ionicons name="flame" size={18} color={colors.tertiary} />
              <Text style={styles.streakText}>{streakCurrent}-day streak going strong</Text>
            </View>
          )}

          <Text style={styles.pitch}>
            This was our retelling. Ready for the whole story, in the author&apos;s own words?
          </Text>

          {purchaseUrl ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={getTheRealBook} activeOpacity={0.9}>
              <Ionicons name="book" size={18} color={colors.onPrimary} />
              <Text style={styles.primaryBtnText}>Get the real book</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.secondaryBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    ...shadows.lg,
  },
  badge: { marginBottom: 16 },
  kicker: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.onSurfaceVariant,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 24,
    color: colors.onSurface,
    textAlign: 'center',
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    backgroundColor: colors.tertiary + '1a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  streakText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.tertiary,
  },
  pitch: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 20,
    marginBottom: 24,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
  },
  primaryBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    fontWeight: '700',
    color: colors.onPrimary,
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    paddingVertical: 14,
    marginTop: 4,
  },
  secondaryBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
});
