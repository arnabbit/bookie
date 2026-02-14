import { useBooksContext } from '@/lib/BooksContext';
import ChapterView from '@/components/ChapterView';
import ProgressBar from '@/components/ProgressBar';
import { Book, Chapter } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, ListRenderItem, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View, ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


type ReadingItem = (Chapter & { type?: undefined }) | { type: 'end'; id: string };

export default function ReadScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { books } = useBooksContext();
    const currentIndexRef = useRef(0);
    const scrollTargetRef = useRef(0);
    const [maxIndex, setMaxIndex] = useState(0);
    const [listHeight, setListHeight] = useState(0);
    const flatListRef = useRef<FlatList<ReadingItem>>(null);

    useFocusEffect(
        useCallback(() => {
            if (flatListRef.current && listHeight > 0 && scrollTargetRef.current > 0) {
                flatListRef.current.scrollToIndex({ index: scrollTargetRef.current, animated: false });
            }

            return () => {
                scrollTargetRef.current = currentIndexRef.current;
            };
        }, [listHeight])
    );

    const book = useMemo(() => books.find((b: Book) => b.id === Number(id)), [id, books]);

    const recommendations = useMemo(() => {
        if (!book) return [];
        return books.filter((b: Book) =>
            b.id !== book.id &&
            b.tags.some((tag: string) => book.tags.includes(tag))
        );
    }, [book]);

    const data: ReadingItem[] = useMemo(() => {
        if (!book) return [];
        return [...book.chapters, { type: 'end', id: 'end-card' } as ReadingItem];
    }, [book]);

    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        if (viewableItems.length > 0) {
            const index = viewableItems[0].index;
            if (index != null) {
                currentIndexRef.current = index;
                setMaxIndex(prev => {
                    const next = Math.max(prev || 0, index);
                    return next === prev ? prev : next;
                });
            }
        }
    }).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50,
    }).current;

    const getItemLayout = (data: ArrayLike<ReadingItem> | null | undefined, index: number) => ({
        length: listHeight,
        offset: listHeight * index,
        index,
    });

    if (!book) {
        return (
            <View style={styles.centered}>
                <Text>Book not found</Text>
            </View>
        );
    }

    const progress = Math.min(1, (maxIndex + 1) / (book.chapters.length));

    const renderItem: ListRenderItem<ReadingItem> = ({ item }) => {
        if (!listHeight) return null;

        if (item.type === 'end') {
            return (
                <ScrollView
                    style={{ height: listHeight }}
                    contentContainerStyle={styles.endContainer}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.congratsContent}>
                        <Ionicons name="checkmark-circle" size={60} color="#22c55e" />
                        <Text style={styles.congratsTitle}>Congratulations!</Text>
                        <Text style={styles.congratsText}>You have finished reading</Text>
                        <Text style={styles.bookTitle}>{book.title}</Text>
                    </View>

                    <View style={styles.recommendations}>
                        <Text style={styles.recTitle}>You might also like:</Text>
                        {recommendations.length > 0 ? (
                            recommendations.map((rec: Book) => (
                                <TouchableOpacity
                                    key={rec.id}
                                    style={styles.recCard}
                                    onPress={() => router.replace(`/read/${rec.id}`)}
                                >
                                    <View style={[styles.recCover, { backgroundColor: rec.coverColor.startsWith('#') ? rec.coverColor : (rec.coverColor === 'bg-stone-600' ? '#57534e' : '#1d4ed8') }]} />
                                    <View style={styles.recInfo}>
                                        <Text style={styles.recBookTitle}>{rec.title}</Text>
                                        <Text style={styles.recAuthor}>{rec.author}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                                </TouchableOpacity>
                            ))
                        ) : (
                            <Text style={styles.noRecs}>No recommendations available right now.</Text>
                        )}

                        <TouchableOpacity style={styles.homeButton} onPress={() => router.dismissTo('/')}>
                            <Text style={styles.homeButtonText}>Back to Library</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            );
        }

        return (
            <ChapterView
                chapter={item}
                style={{ height: listHeight }}
                onDetailsPress={() => router.push(`/read/${id}/chapter/${item.id}`)}
            />
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="close" size={24} color="#1f2937" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{book.title}</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={{ flex: 1 }} onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}>
                {listHeight > 0 && (
                    <FlatList
                        ref={flatListRef}
                        data={data}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.id.toString()}
                        pagingEnabled
                        showsVerticalScrollIndicator={false}
                        onViewableItemsChanged={onViewableItemsChanged}
                        viewabilityConfig={viewabilityConfig}
                        getItemLayout={getItemLayout}
                        initialNumToRender={3}
                        maxToRenderPerBatch={3}
                        windowSize={5}
                    />
                )}
            </View>

            <ProgressBar progress={progress} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
        justifyContent: 'space-between',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1f2937',
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 16,
    },
    endContainer: {
        padding: 20,
        paddingBottom: 20,
        alignItems: 'center',
    },
    congratsContent: {
        alignItems: 'center',
        marginBottom: 24,
    },
    congratsTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#1f2937',
        marginTop: 16,
        marginBottom: 8,
    },
    congratsText: {
        fontSize: 16,
        color: '#6b7280',
        marginBottom: 8,
    },
    bookTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111827',
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    recommendations: {
        width: '100%',
    },
    recTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#1f2937',
    },
    recCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        padding: 12,
        borderRadius: 12,
        marginBottom: 10,
    },
    recCover: {
        width: 40,
        height: 56,
        borderRadius: 4,
        marginRight: 16,
    },
    recInfo: {
        flex: 1,
    },
    recBookTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1f2937',
        marginBottom: 2,
    },
    recAuthor: {
        fontSize: 13,
        color: '#6b7280',
    },
    noRecs: {
        color: '#9ca3af',
        fontStyle: 'italic',
        marginBottom: 20,
    },
    homeButton: {
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 10,
    },
    homeButtonText: {
        color: '#3b82f6',
        fontSize: 16,
        fontWeight: '600',
    },
});
