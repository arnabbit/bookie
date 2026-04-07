import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, API_URL } from '@/lib/AuthContext';
import { colors, fonts, radius, shadows, ghostBorder } from '@/lib/theme';

export default function ProfileScreen() {
  const { user, token, logout } = useAuth();
  const router = useRouter();
  const [bio, setBio] = useState('');
  const [editing, setEditing] = useState(false);

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to logout?')) logout();
    } else {
      Alert.alert('Logout', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: logout },
      ]);
    }
  };

  const saveBio = async () => {
    try {
      await fetch(`${API_URL}/api/users/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bio }),
      });
      setEditing(false);
    } catch {}
  };

  const initials = user?.username?.substring(0, 2)?.toUpperCase() || 'U';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }}>
      {/* Avatar Section */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarRing}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{initials}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.editAvatarBtn}>
            <Ionicons name="pencil" size={14} color={colors.onTertiary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.displayName}>{user?.username}</Text>
        <Text style={styles.memberLabel}>Member</Text>

        {/* Bio */}
        {editing ? (
          <View style={styles.bioEditWrap}>
            <TextInput
              style={styles.bioInput}
              value={bio}
              onChangeText={setBio}
              multiline
              maxLength={150}
              placeholder="Write about yourself..."
              placeholderTextColor={colors.onSurfaceVariant + '80'}
            />
            <TouchableOpacity style={styles.saveBioBtn} onPress={saveBio}>
              <Text style={styles.saveBioBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditing(true)} style={styles.bioWrap}>
            <Text style={bio ? styles.bioText : styles.bioPlaceholder}>
              {bio || '"Tap to add a bio..."'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: colors.surfaceContainerLow }]}>
          <Text style={[styles.statNumber, { color: colors.tertiary }]}>0</Text>
          <Text style={styles.statLabel}>Books Read</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surfaceContainerHighest }]}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Pages Read</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surfaceContainerLow }]}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Friends</Text>
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.menuSection}>
        {user?.isAdmin && (
          <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/admin' as any)}>
            <Ionicons name="shield-outline" size={22} color={colors.tertiary} />
            <Text style={styles.menuRowText}>Admin Portal</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.outlineVariant} />
          </TouchableOpacity>
        )}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={colors.error} />
        <Text style={styles.logoutText}>Logout from Booksocial</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  // Avatar section
  avatarSection: {
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 32,
    paddingHorizontal: 32,
  },
  avatarRing: { position: 'relative', marginBottom: 16 },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 6,
    borderColor: colors.surfaceContainerLow,
  },
  avatarFallback: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 6,
    borderColor: colors.surfaceContainerLow,
  },
  avatarFallbackText: {
    fontFamily: fonts.headlineBold,
    fontSize: 40,
    color: colors.onSurfaceVariant,
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: colors.tertiary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  displayName: {
    fontFamily: fonts.headlineBold,
    fontSize: 32,
    color: colors.onSurface,
    letterSpacing: -0.5,
  },
  memberLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.onSurfaceVariant,
    marginTop: 4,
    marginBottom: 16,
  },
  bioWrap: { maxWidth: 300, paddingHorizontal: 16 },
  bioText: {
    fontFamily: fonts.headlineItalic,
    fontStyle: 'italic',
    fontSize: 16,
    color: colors.onSurface,
    textAlign: 'center',
    lineHeight: 24,
  },
  bioPlaceholder: {
    fontFamily: fonts.headlineItalic,
    fontStyle: 'italic',
    fontSize: 16,
    color: colors.onSurfaceVariant + '80',
    textAlign: 'center',
  },
  bioEditWrap: { width: '100%', marginTop: 8 },
  bioInput: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 12,
    padding: 14,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.onSurface,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  saveBioBtn: {
    backgroundColor: colors.primaryContainer,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  saveBioBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    fontWeight: '700',
    color: colors.onPrimary,
  },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 10,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: fonts.headlineBold,
    fontSize: 28,
    color: colors.onSurface,
  },
  statLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },

  // Menu
  menuSection: {
    paddingHorizontal: 24,
    gap: 6,
    marginBottom: 32,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 18,
    gap: 14,
  },
  menuRowText: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.onSurface,
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: colors.error + '1a',
  },
  logoutText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    fontWeight: '700',
    color: colors.error,
  },
});
