import { API_URL, useAuth } from '@/lib/AuthContext';
import { colors, fonts, shadows } from '@/lib/theme';
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
  const { id, format } = useLocalSearchParams();
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
  const scrollSettled = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listHeightRef = useRef(0);

  // Fetch book + saved position
  useEffect(() => {
    (async () => {
      try {
        const [bookRes, posRes] = await Promise.all([
          fetch(`${API_URL}/api/books/${id}/read?format=${format || 'mini'}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/api/books/${id}/position?format=${format || 'mini'}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (bookRes.ok) setBook(await bookRes.json());
        if (posRes.ok) {
          const pos = await posRes.json();
          savedPageRef.current = pos.page || 0;
          console.log('[READER] fetched saved position:', savedPageRef.current);
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

  // Save reading position debounced (500ms after last page change)
  useEffect(() => {
    if (!id || loading || !scrollSettled.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      console.log('[READER] save-position:', currentPage);
      fetch(`${API_URL}/api/books/${id}/position`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ page: currentPage, format: format || 'mini' }),
      }).catch(() => {});
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [currentPage, loading]);

  // Track listHeight changes — if it shifts after initial render, re-scroll to current page
  useEffect(() => {
    if (!flatListRef.current || listHeight <= 0) return;
    if (listHeightRef.current > 0 && listHeightRef.current !== listHeight) {
      // Height changed after initial render — re-scroll to stay on current page
      const target = currentIndexRef.current;
      console.log('[READER] listHeight changed:', listHeightRef.current, '->', listHeight, 'rescroll to:', target);
      setTimeout(() => flatListRef.current?.scrollToIndex({ index: target, animated: false }), 50);
    }
    listHeightRef.current = listHeight;
  }, [listHeight]);

  const totalPages = book?.pages?.length || 0;
  const page = book?.pages?.[currentPage];

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      const idx = viewableItems[0].index;
      const prev = currentIndexRef.current;
      console.log('[READER] onViewable:', idx, 'prev:', prev, 'settled:', scrollSettled.current);
      // Ignore events until initial scroll lands on the saved page
      if (!scrollSettled.current) {
        if (idx === savedPageRef.current || savedPageRef.current === 0) {
          scrollSettled.current = true;
          console.log('[READER] scroll settled at:', idx);
        } else {
          return;
        }
      }
      currentIndexRef.current = idx;
      setCurrentPage(idx);
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
              format: format || 'mini',
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
        <ActivityIndicator size="large" color={colors.tertiary} />
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
            <Ionicons name="chatbubble-outline" size={22} color={colors.tertiary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={openShareModal} style={styles.headerBtn}>
            <Ionicons name="share-outline" size={22} color={colors.tertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Swipeable vertical card carousel */}
      <View style={{ flex: 1 }} onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h !== listHeightRef.current) {
          console.log('[READER] onLayout height:', h, 'prev:', listHeightRef.current);
          setListHeight(h);
        }
      }}>
        {listHeight > 0 && (
          <FlatList
            ref={flatListRef}
            data={book.pages}
            renderItem={renderItem}
            keyExtractor={(_, i) => i.toString()}
            snapToInterval={listHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            bounces={false}
            overScrollMode="never"
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
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
            {actionLoading ? (
              <ActivityIndicator size="large" color={colors.tertiary} style={{ padding: 32 }} />
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
                <Ionicons name="close" size={24} color={colors.onSurface} />
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
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
  },
  pageIndicator: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.onSurfaceVariant },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { padding: 4 },
  pageCard: {
    paddingHorizontal: 32,
    paddingVertical: 60,
    justifyContent: 'center',
  },
  pageText: { fontFamily: fonts.headline, fontSize: 17, lineHeight: 28, color: colors.onSurface },
  noContent: { fontFamily: fonts.body, fontSize: 16, color: colors.outlineVariant, marginTop: 40, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  modalTitle: { fontFamily: fonts.headlineBold, fontSize: 18, color: colors.onSurface },
  emptyList: { fontFamily: fonts.body, textAlign: 'center', padding: 24, color: colors.onSurfaceVariant },
  friendItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarText: { fontFamily: fonts.bodyBold, color: colors.onSurfaceVariant, fontSize: 14 },
  friendName: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.onSurface },
  commentModalContent: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  commentsList: { maxHeight: 300 },
  commentItem: { padding: 16, paddingTop: 4 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  commentAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarTextSmall: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.onSurfaceVariant },
  commentUser: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.onSurface },
  commentTime: { fontFamily: fonts.body, fontSize: 11, color: colors.onSurfaceVariant, marginLeft: 'auto' },
  commentContent: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  commentDelete: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.error },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.onSurface,
  },
  sendCommentBtn: { padding: 8 },
  sendCommentBtnDisabled: { opacity: 0.4 },
});
