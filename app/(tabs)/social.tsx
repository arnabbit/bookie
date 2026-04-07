import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, useAuth } from '@/lib/AuthContext';
import { colors, fonts, radius, shadows, ghostBorder } from '@/lib/theme';

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
interface Conversation {
  _id: string;
  participants: { _id: string; username: string }[];
  lastMessage?: { _id: string };
  lastMessagePreview?: string;
  updatedAt: string;
  readBy?: Record<string, string>;
}

export default function SocialScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [sentRequests, setSentRequests] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [friendsRes, requestsRes, outgoingRes, convsRes] = await Promise.all([
        fetch(`${API_URL}/api/friends`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/friends/requests/incoming`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/friends/requests/outgoing`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/chat/conversations`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (friendsRes.ok) setFriends(await friendsRes.json());
      if (requestsRes.ok) setRequests(await requestsRes.json());
      if (outgoingRes.ok) {
        const outgoing = await outgoingRes.json();
        setSentRequests(outgoing.map((r: any) => r.to._id));
      }
      if (convsRes.ok) setConversations(await convsRes.json());
    } catch (err) { console.error('social fetch error:', err); }
  }, [token]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 1) { setSearchResults([]); return; }
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ toUserId: userId }),
      });
      setSentRequests((prev) => [...prev, userId]);
    } catch { /* ignore */ }
  };

  const respondToRequest = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      await fetch(`${API_URL}/api/friends/requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      setRequests((prev) => prev.filter((r) => r._id !== requestId));
      const r = await fetch(`${API_URL}/api/friends`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setFriends(await r.json());
    } catch { /* ignore */ }
  };

  const openChat = async (friendId: string, username: string) => {
    try {
      const res = await fetch(`${API_URL}/api/chat/conversation/with/${friendId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const conv = await res.json();
        (router as any).push({ pathname: '/chat', params: { id: conv._id, username } });
      }
    } catch { /* ignore */ }
  };

  const initials = (name?: string) => (name?.substring(0, 2) || '?').toUpperCase();

  const hasUnread = (friendId: string) => {
    const conv = conversations.find((c) =>
      c.participants.some((p) => p._id === friendId)
    );
    if (!conv || !conv.lastMessage || !user?.id) return false;
    const myReadAt = conv.readBy?.[user.id];
    if (!myReadAt) return true;
    return new Date(conv.updatedAt) > new Date(myReadAt);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Social</Text>
      </View>

      {/* Search Bar */}
      <TouchableOpacity style={styles.searchBar} onPress={() => setShowSearch(true)} activeOpacity={0.8}>
        <Ionicons name="search" size={20} color={colors.onSurfaceVariant} />
        <Text style={styles.searchPlaceholder}>Find new friends</Text>
      </TouchableOpacity>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Friend Requests */}
        {requests.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Friend Requests</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{requests.length} New</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.requestsScroll}>
              {requests.map((item) => (
                <View key={item._id} style={styles.requestCard}>
                  <View style={styles.requestAvatarWrap}>
                    <View style={styles.requestAvatar}>
                      <Text style={styles.requestAvatarText}>{initials(item.from?.username)}</Text>
                    </View>
                    <View style={styles.requestAvatarBadge}>
                      <Ionicons name="book" size={10} color={colors.onPrimary} />
                    </View>
                  </View>
                  <Text style={styles.requestName} numberOfLines={1}>{item.from?.username}</Text>
                  <View style={styles.requestBtns}>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => respondToRequest(item._id, 'accept')}
                    >
                      <Text style={styles.acceptBtnText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.declineBtn}
                      onPress={() => respondToRequest(item._id, 'reject')}
                    >
                      <Text style={styles.declineBtnText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Friends List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Friends</Text>
          {friends.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="people-outline" size={48} color={colors.surfaceContainerHighest} />
              <Text style={styles.emptyText}>No friends yet. Search and add people!</Text>
            </View>
          ) : (
            friends.map((item) => {
              const unread = hasUnread(item._id);
              return (
                <TouchableOpacity
                  key={item._id}
                  style={styles.friendRow}
                  onPress={() => openChat(item._id, item.username)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.friendAvatar, unread && styles.friendAvatarUnread]}>
                    <Text style={styles.friendAvatarText}>{initials(item.username)}</Text>
                  </View>
                  <View style={styles.friendInfo}>
                    <Text style={[styles.friendName, unread && styles.friendNameUnread]}>{item.username}</Text>
                    {item.bio ? (
                      <Text style={styles.friendBio} numberOfLines={1}>{item.bio}</Text>
                    ) : null}
                  </View>
                  <View style={styles.chatBtnWrap}>
                    <TouchableOpacity
                      style={styles.chatBtn}
                      onPress={() => openChat(item._id, item.username)}
                    >
                      <Ionicons name="chatbubble-outline" size={20} color={unread ? colors.tertiary : colors.onSurfaceVariant} />
                    </TouchableOpacity>
                    {unread && <View style={styles.unreadDot} />}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Search Modal */}
      <Modal visible={showSearch} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Friends</Text>
              <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalSearchWrap}>
              <Ionicons name="search" size={20} color={colors.onSurfaceVariant} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search by username..."
                placeholderTextColor={colors.onSurfaceVariant + '80'}
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
                <Text style={styles.emptyList}>
                  {searchQuery.length >= 1 ? 'No users found' : 'Type a username to search'}
                </Text>
              }
              renderItem={({ item }) => {
                const isSent = sentRequests.includes(item._id);
                return (
                  <View style={styles.searchResultItem}>
                    <View style={styles.searchResultAvatar}>
                      <Text style={styles.searchResultAvatarText}>{initials(item.username)}</Text>
                    </View>
                    <Text style={styles.searchResultName}>{item.username}</Text>
                    <TouchableOpacity
                      style={[styles.addFriendBtn, isSent && styles.addFriendBtnSent]}
                      disabled={isSent}
                      onPress={() => sendRequest(item._id)}
                    >
                      <Text style={[styles.addFriendBtnText, isSent && { color: colors.onSurfaceVariant }]}>
                        {isSent ? 'Sent' : 'Add'}
                      </Text>
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
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 8,
  },
  headerTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 28,
    color: colors.onSurface,
    letterSpacing: -0.3,
  },

  // Search bar (pressable placeholder)
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 16,
    paddingHorizontal: 20,
    height: 52,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 26,
    gap: 12,
    ...shadows.sm,
  },
  searchPlaceholder: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurfaceVariant + '80',
  },

  // Sections
  section: { paddingHorizontal: 24, marginBottom: 16 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.2,
  },
  countBadge: {
    backgroundColor: colors.tertiary + '1a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    color: colors.tertiary,
  },

  // Friend Requests
  requestsScroll: { gap: 12, paddingBottom: 8 },
  requestCard: {
    width: 220,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    ...ghostBorder(0.1),
  },
  requestAvatarWrap: { position: 'relative', marginBottom: 12 },
  requestAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.surfaceContainerLowest,
  },
  requestAvatarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  requestAvatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.tertiary,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surfaceContainerLowest,
  },
  requestName: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 12,
  },
  requestBtns: { flexDirection: 'row', gap: 8, width: '100%' },
  acceptBtn: {
    flex: 1,
    backgroundColor: colors.primaryContainer,
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  acceptBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  declineBtn: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  declineBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurface,
  },

  // Friends
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    gap: 14,
  },
  friendAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  friendAvatarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  friendInfo: { flex: 1 },
  friendName: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
  },
  friendBio: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  friendAvatarUnread: {
    backgroundColor: colors.tertiary + '30',
    borderWidth: 2,
    borderColor: colors.tertiary,
  },
  friendNameUnread: { fontWeight: '800' },
  chatBtnWrap: { alignItems: 'center', gap: 4 },
  chatBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceContainerHighest,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.tertiary,
  },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' },
  emptyList: { fontFamily: fonts.body, textAlign: 'center', paddingVertical: 24, color: colors.onSurfaceVariant },

  // Search Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  modalTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 20,
    color: colors.onSurface,
  },
  modalSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 20,
    gap: 10,
  },
  modalSearchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.onSurface,
    paddingVertical: 12,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 12,
  },
  searchResultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultAvatarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  searchResultName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.onSurface,
  },
  addFriendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.primaryContainer,
  },
  addFriendBtnSent: {
    backgroundColor: colors.surfaceContainerHighest,
  },
  addFriendBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});
