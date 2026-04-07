import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, useAuth } from '@/lib/AuthContext';

interface Participant {
  _id: string;
  username: string;
  avatar?: string;
}

interface Conversation {
  _id: string;
  participants: Participant[];
  lastMessage?: {
    _id: string;
    content: string;
    type: string;
  };
  lastMessagePreview: string;
  updatedAt: string;
  readBy?: Record<string, string>;
}

const timeAgo = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
};

export default function ConversationsScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/chat/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setConversations(data);
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const getOtherUser = (conv: Conversation) => {
    return conv.participants.find((p) => p._id !== user?.id);
  };

  const isUnread = (conv: Conversation) => {
    if (!conv.lastMessage || !user?.id) return false;
    const myReadAt = conv.readBy?.[user.id];
    if (!myReadAt) return false; // no read tracking yet — treat as read
    return new Date(conv.updatedAt) > new Date(myReadAt);
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const other = getOtherUser(item);
    if (!other) return null;
    const unread = isUnread(item);

    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => (router as any).push({
          pathname: '/chat',
          params: { id: item._id, username: other.username },
        })}
      >
        <View style={[styles.avatar, unread && styles.avatarUnread]}>
          <Text style={styles.avatarText}>
            {(other.username?.substring(0, 2) || 'U').toUpperCase()}
          </Text>
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, unread && styles.nameUnread]}>{other.username}</Text>
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {item.lastMessagePreview || 'Start chatting...'}
          </Text>
        </View>
        <View style={styles.timeCol}>
          {item.updatedAt && (
            <Text style={[styles.time, unread && styles.timeUnread]}>{timeAgo(item.updatedAt)}</Text>
          )}
          {unread && <View style={styles.unreadDot} />}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (conversations.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No conversations yet. Add friends and start chatting!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item._id}
        renderItem={renderConversation}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  nameUnread: { fontWeight: '800' },
  preview: { fontSize: 14, color: '#999', marginTop: 2 },
  previewUnread: { color: '#1a1a2e', fontWeight: '600' },
  timeCol: { alignItems: 'flex-end', gap: 6 },
  time: { fontSize: 12, color: '#bbb' },
  timeUnread: { color: '#705d00', fontWeight: '600' },
  avatarUnread: { backgroundColor: '#705d00' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#c9a900' },
  separator: { height: 1, backgroundColor: '#f5f5f5', marginLeft: 78 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  empty: { fontSize: 15, color: '#999', textAlign: 'center' },
});
