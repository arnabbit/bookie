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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, API_URL } from '@/lib/AuthContext';

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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bio }),
      });
      setEditing(false);
    } catch { /* ignore */ }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Profile</Text>

      <View style={styles.profileSection}>
        <View style={styles.avatarContainer}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <Text style={styles.avatarFallback}>
              {user?.username?.substring(0, 2)?.toUpperCase() || 'U'}
            </Text>
          )}
        </View>
        <Text style={styles.username}>@{user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.bioSection}>
        <Text style={styles.bioLabel}>Bio</Text>
        {editing ? (
          <>
            <TextInput
              style={styles.bioInput}
              value={bio}
              onChangeText={setBio}
              multiline
              maxLength={150}
              placeholder="Tell others about yourself..."
            />
            <TouchableOpacity style={styles.saveBtn} onPress={saveBio}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.bioText || styles.bioPlaceholder}>
              {bio || 'Tap to add bio'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingBottom: 10 },
  header: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a2e',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  profileSection: { alignItems: 'center', paddingVertical: 24, borderBottomWidth: 1, borderBottomColor: '#eee' },
  avatarContainer: { marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#6366f1',
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 80,
  },
  username: { fontSize: 20, fontWeight: '700', color: '#1a1a2e' },
  email: { fontSize: 14, color: '#999', marginTop: 2 },
  bioSection: { paddingHorizontal: 24, paddingTop: 20 },
  bioLabel: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8 },
  bioInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  bioText: { fontSize: 15, color: '#333' },
  bioPlaceholder: { fontSize: 15, color: '#999', fontStyle: 'italic' },
  saveBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  logoutBtn: {
    marginTop: 40,
    marginHorizontal: 24,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
  },
  logoutText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
});
