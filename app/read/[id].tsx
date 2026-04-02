import { API_URL, useAuth } from '@/lib/AuthContext';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { io } from 'socket.io-client';

export default function BookReaderScreen() {
  const { id } = useLocalSearchParams();
  const { token, user } = useAuth();
  const [book, setBook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [listHeight, setListHeight] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const currentIndexRef = useRef(0);
  const savedPageRef = useRef(0);

  // Fetch book + saved position
  useEffect(() => {
    (async () => {
      try {
        const [bookRes, posRes] = await Promise.all([
          fetch(`${API_URL}/api/books/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/api/books/${id}/position`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (bookRes.ok) setBook(await bookRes.json());
        if (posRes.ok) {
          const pos = await posRes.json();
          savedPageRef.current = pos.page || 0;
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [id, token]);

  // Fetch comments for current page
  const fetchComments = useCallback(
    (bookId: string, page: number) => {
      fetch(`${API_URL}/api/comments/${bookId}/${page}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : []))
        .then(setComments)
        .catch(() => {});
    },
    [token]
  );

  useEffect(() => {
    if (book && id) {
      fetchComments(id as string, currentPage);
    }
  }, [book, id, currentPage, fetchComments]);

  // Save reading position on page change
  useEffect(() => {
    if (!id) return;
    fetch(`${API_URL}/api/books/${id}/position`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ page: currentPage }),
    }).catch(() => {});
  }, [currentPage]);

  // Scroll to saved page once listHeight is known
  useEffect(() => {
    if (flatListRef.current && listHeight > 0 && savedPageRef.current > 0) {
      flatListRef.current.scrollToIndex({ index: savedPageRef.current, animated: false });
    }
  }, [listHeight]);

  const totalPages = book?.pages?.length || 0;
  const page = book?.pages?.[currentPage];

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      currentIndexRef.current = viewableItems[0].index;
      setCurrentPage(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const getItemLayout = (_: any, index: number) => ({
    length: listHeight,
    offset: listHeight * index,
    index,
  });

  const openShareModal = async () => {
    try {
      const res = await fetch(`${API_URL}/api/friends`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setFriends(await res.json());
      setShowShareModal(true);
    } catch { /* ignore */ }
  };

  const sharePageWithFriend = async (friendId: string) => {
    setActionLoading(true);
    try {
      const convRes = await fetch(`${API_URL}/api/chat/conversation/with/${friendId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (convRes.ok) {
        const conv = await convRes.json();
        const socket = io(API_URL, { auth: { token }, transports: ['websocket'] });
        socket.on('connect', () => {
          socket.emit('send-message', {
            conversationId: conv._id,
            content: '',
            type: 'book-share',
            sharedBookPage: {
              book: book._id,
              bookTitle: book.title,
              pageNumber: currentPage,
              content: page?.content || '',
            },
          });
          setTimeout(() => { socket.disconnect(); }, 500);
        });
      }
    } catch { /* ignore */ }
    finally {
      setActionLoading(false);
      setShowShareModal(false);
    }
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bookId: id as string,
          pageNumber: currentPage,
          content: newComment.trim(),
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setComments((prev) => [...prev, saved]);
        setNewComment('');
      }
    } catch { /* ignore */ }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await fetch(`${API_URL}/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setComments((prev) => prev.filter((x: any) => x._id !== commentId));
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!book) {
    return (
      <View style={styles.centered}>
        <Text>Book not found</Text>
      </View>
    );
  }

  const renderItem: ListRenderItem<any> = ({ item }) => {
    if (!listHeight) return null;
    return (
      <View style={[styles.pageCard, { height: listHeight }]}>
        {item.content ? (
          <Text style={styles.pageText}>{item.content}</Text>
        ) : (
          <Text style={styles.noContent}>No content on this page.</Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: book.title }} />

      <View style={styles.header}>
        <Text style={styles.pageIndicator}>
          {listHeight > 0 ? currentPage + 1 : (savedPageRef.current + 1)} / {totalPages}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => {
              if (book && id) fetchComments(id as string, currentPage);
              setShowCommentModal(true);
            }}
            style={styles.headerBtn}
          >
            <Ionicons name="chatbubble-outline" size={22} color="#6366f1" />
          </TouchableOpacity>
          <TouchableOpacity onPress={openShareModal} style={styles.headerBtn}>
            <Ionicons name="share-outline" size={22} color="#6366f1" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Swipeable vertical card carousel */}
      <View style={{ flex: 1 }} onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}>
        {listHeight > 0 && (
          <FlatList
            ref={flatListRef}
            data={book.pages}
            renderItem={renderItem}
            keyExtractor={(_, i) => i.toString()}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={getItemLayout}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={5}
            initialScrollIndex={savedPageRef.current}
          />
        )}
      </View>

      {/* Share Modal */}
      <Modal visible={showShareModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Share Page {currentPage + 1}</Text>
              <TouchableOpacity onPress={() => setShowShareModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            {actionLoading ? (
              <ActivityIndicator size="large" color="#6366f1" style={{ padding: 32 }} />
            ) : (
              <FlatList
                data={friends}
                keyExtractor={(f) => f._id}
                ListEmptyComponent={<Text style={styles.emptyList}>No friends to share with</Text>}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.friendItem}
                    onPress={() => sharePageWithFriend(item._id)}
                  >
                    <View style={styles.friendAvatar}>
                      <Text style={styles.friendAvatarText}>
                        {(item.username || '?').substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.friendName}>{item.username}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Comment Modal */}
      <Modal visible={showCommentModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.commentModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments — Page {currentPage + 1}</Text>
              <TouchableOpacity onPress={() => setShowCommentModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.commentsList}>
              {comments.length === 0 ? (
                <Text style={styles.emptyList}>No comments yet</Text>
              ) : (
                comments.map((c: any) => (
                  <View key={c._id} style={styles.commentItem}>
                    <View style={styles.commentHeader}>
                      <View style={styles.commentAvatarSmall}>
                        <Text style={styles.commentAvatarTextSmall}>
                          {(c.user?.username || '?').substring(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.commentUser}>{c.user?.username}</Text>
                      <Text style={styles.commentTime}>
                        {new Date(c.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.commentContent}>{c.content}</Text>
                    {c.user?._id === user?.id && (
                      <TouchableOpacity onPress={() => deleteComment(c._id)} style={{ marginTop: 4 }}>
                        <Text style={styles.commentDelete}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>

            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                value={newComment}
                onChangeText={setNewComment}
                placeholder="Add a comment..."
                maxLength={500}
                onSubmitEditing={postComment}
              />
              <TouchableOpacity
                style={[styles.sendCommentBtn, !newComment.trim() && styles.sendCommentBtnDisabled]}
                onPress={postComment}
                disabled={!newComment.trim()}
              >
                <Ionicons name="send" size={20} color={newComment.trim() ? '#6366f1' : '#ccc'} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    justifyContent: 'space-between',
  },
  pageIndicator: { fontSize: 14, color: '#999', fontWeight: '600' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { padding: 4 },
  pageCard: {
    paddingHorizontal: 32,
    paddingVertical: 60,
    justifyContent: 'center',
  },
  pageText: { fontSize: 17, lineHeight: 28, color: '#333' },
  noContent: { fontSize: 16, color: '#ccc', marginTop: 40, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
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
  emptyList: { textAlign: 'center', padding: 24, color: '#999' },
  friendItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  friendName: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  commentModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  commentsList: { maxHeight: 300 },
  commentItem: { padding: 16, paddingTop: 4, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  commentAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarTextSmall: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  commentUser: { fontSize: 14, fontWeight: '600' },
  commentTime: { fontSize: 11, color: '#aaa', marginLeft: 'auto' },
  commentContent: { fontSize: 14, color: '#333', lineHeight: 20 },
  commentDelete: { fontSize: 12, color: '#ef4444' },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendCommentBtn: { padding: 8 },
  sendCommentBtnDisabled: { opacity: 0.4 },
});
