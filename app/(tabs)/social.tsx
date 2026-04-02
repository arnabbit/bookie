import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, useAuth } from '@/lib/AuthContext';

interface Friend {
  _id: string;
  username: string;
  avatar?: string;
  bio?: string;
}

interface FriendRequest {
  _id: string;
  from?: { _id: string; username: string; avatar?: string };
}

interface UserResult {
  _id: string;
  username: string;
  avatar?: string;
  bio?: string;
}

export default function SocialScreen() {
  const { token } = useAuth();
  const router = useRouter();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [sentRequests, setSentRequests] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [friendsRes, requestsRes, outgoingRes] = await Promise.all([
        fetch(`${API_URL}/api/friends`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/friends/requests/incoming`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/friends/requests/outgoing`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (friendsRes.ok) setFriends(await friendsRes.json());
      if (requestsRes.ok) setRequests(await requestsRes.json());
      if (outgoingRes.ok) {
        const outgoing = await outgoingRes.json();
        setSentRequests(outgoing.map((r: any) => r.to._id));
      }
    } catch { /* ignore */ }
  }, [token]);

  useFocusEffect(fetchData);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 1) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/users/search?q=${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSearchResults(await res.json());
    } catch { /* ignore */ }
  };

  const sendRequest = async (userId: string) => {
    try {
      await fetch(`${API_URL}/api/friends/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ toUserId: userId }),
      });
      setSentRequests((prev) => [...prev, userId]);
    } catch { /* ignore */ }
  };

  const respondToRequest = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      await fetch(`${API_URL}/api/friends/requests/${requestId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      });
      setRequests((prev) => prev.filter((r) => r._id !== requestId));
      // Refresh friends
      await fetch(`${API_URL}/api/friends`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => (r.ok ? r.json().then(setFriends) : null));
    } catch { /* ignore */ }
  };

  const openChat = async (friendId: string, username: string) => {
    // Create or get conversation
    try {
      const res = await fetch(`${API_URL}/api/chat/conversation/with/${friendId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const conv = await res.json();
        (router as any).push({
          pathname: '/chat',
          params: { id: conv._id, username },
        });
      }
    } catch { /* ignore */ }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Social</Text>
        <View style={styles.headerActions}>
          {requests.length > 0 && (
            <View style={styles.requestBadge}>
              <Ionicons name="person-add" size={18} color="#fff" />
              <View style={styles.requestBadgeText}>
                <Text style={styles.requestBadgeCount}>{requests.length}</Text>
              </View>
            </View>
          )}
          <TouchableOpacity onPress={() => setShowSearch(true)} style={styles.searchButton}>
            <Ionicons name="search" size={24} color="#333" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Incoming Requests */}
      {requests.length > 0 && (
        <View style={styles.requestsSection}>
          <Text style={styles.sectionTitle}>Friend Requests</Text>
          <FlatList
            data={requests}
            horizontal
            keyExtractor={(item) => item._id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.requestsScroll}
            renderItem={({ item }) => (
              <View style={styles.requestCard}>
                <View style={styles.requestAvatar}>
                  <Text style={styles.requestAvatarText}>
                    {(item.from?.username?.substring(0, 2) || '?').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.requestName} numberOfLines={1}>{item.from?.username}</Text>
                <View style={styles.requestBtns}>
                  <TouchableOpacity
                    style={[styles.requestBtn, styles.acceptBtn]}
                    onPress={() => respondToRequest(item._id, 'accept')}
                  >
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.requestBtn, styles.rejectBtn]}
                    onPress={() => respondToRequest(item._id, 'reject')}
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      )}

      {/* Friends List */}
      <Text style={styles.sectionTitle}>Friends</Text>
      <FlatList
        data={friends}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.friendsList}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="people-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No friends yet. Search and add people!</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.friendItem}
            onPress={() => openChat(item._id, item.username)}
          >
            <View style={styles.friendAvatar}>
              <Text style={styles.friendAvatarText}>
                {(item.username?.substring(0, 2) || '?').toUpperCase()}
              </Text>
            </View>
            <View style={styles.friendInfo}>
              <Text style={styles.friendName}>{item.username}</Text>
              {item.bio ? <Text style={styles.friendBio} numberOfLines={1}>{item.bio}</Text> : null}
            </View>
            <Ionicons name="chatbubble-outline" size={20} color="#999" />
          </TouchableOpacity>
        )}
      />

      {/* Search Modal */}
      <Modal visible={showSearch} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Friends</Text>
              <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchBar}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by username..."
                value={searchQuery}
                onChangeText={handleSearch}
                autoCapitalize="none"
                autoFocus
              />
            </View>

            <FlatList
              data={searchResults}
              keyExtractor={(item) => item._id}
              ListEmptyComponent={
                searchQuery.length >= 1 ? (
                  <Text style={styles.emptyList}>No users found</Text>
                ) : (
                  <Text style={styles.emptyList}>Type a username to search</Text>
                )
              }
              renderItem={({ item }) => {
                const isSent = sentRequests.includes(item._id);
                return (
                  <View style={styles.searchResultItem}>
                    <View style={styles.friendAvatarSmall}>
                      <Text style={styles.friendAvatarSmallText}>
                        {(item.username?.substring(0, 2) || '?').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.searchResultName}>{item.username}</Text>
                    <TouchableOpacity
                      style={[styles.addBtn, isSent && styles.addBtnSent]}
                      disabled={isSent}
                      onPress={() => sendRequest(item._id)}
                    >
                      <Text style={styles.addBtnText}>{isSent ? 'Sent' : 'Add'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingBottom: 10 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#1a1a2e' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchButton: { padding: 4 },
  requestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  requestBadgeText: {},
  requestBadgeCount: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Request cards
  requestsSection: { paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e', paddingHorizontal: 0, paddingTop: 8, paddingBottom: 8 },
  requestsScroll: { gap: 8, paddingBottom: 12 },
  requestCard: {
    width: 110,
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 16,
  },
  requestAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestAvatarText: { fontSize: 18, fontWeight: '700', color: '#64748b' },
  requestName: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 8, maxWidth: 100 },
  requestBtns: { flexDirection: 'row', gap: 6 },
  requestBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptBtn: { backgroundColor: '#6366f1' },
  rejectBtn: { backgroundColor: '#ef4444' },

  // Friends list
  friendsList: { flexGrow: 1 },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 12,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  friendAvatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarSmallText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  friendBio: { fontSize: 13, color: '#999', marginTop: 2 },
  center: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center' },
  emptyList: { textAlign: 'center', paddingVertical: 24, color: '#999' },

  // Search modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  searchBar: { paddingHorizontal: 16, paddingVertical: 12 },
  searchInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 12,
  },
  searchResultName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#6366f1',
  },
  addBtnSent: { backgroundColor: '#ddd' },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
