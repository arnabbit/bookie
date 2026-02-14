import { useBooksContext } from '@/lib/BooksContext';
import PageView from '@/components/PageView';
import ProgressBar from '@/components/ProgressBar';
import { Book, Chapter, Page } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { FlatList, ListRenderItem, StatusBar, StyleSheet, Text, TouchableOpacity, View, ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


type ReadingPage =
    | { type: 'page'; page: Page; pageNumber: number; totalPages: number; id: string }
    | { type: 'end'; id: string };

export default function ChapterDetailsScreen() {
    const { id, chapterId } = useLocalSearchParams();
    const router = useRouter();
    const [maxIndex, setMaxIndex] = useState(0);
    const [listHeight, setListHeight] = useState(0);

    const { books } = useBooksContext();
    const book = useMemo(() => books.find((b: Book) => b.id === Number(id)), [id, books]);
    const chapter = useMemo(() => book?.chapters.find((c: Chapter) => c.id === Number(chapterId)), [book, chapterId]);

    const data: ReadingPage[] = useMemo(() => {
        if (!chapter) return [];

        const totalPages = chapter.pages.length;
        const pages: ReadingPage[] = chapter.pages.map((page, index) => ({
            type: 'page',
            id: `page-${page.id}`,
            page,
            pageNumber: index + 1,
            totalPages,
        }));

        pages.push({ type: 'end', id: 'chapter-end' });
        return pages;
    }, [chapter]);

    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        if (viewableItems.length > 0) {
            const index = viewableItems[0].index;
            if (index != null) {
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

    const getItemLayout = (data: ArrayLike<ReadingPage> | null | undefined, index: number) => ({
        length: listHeight,
        offset: listHeight * index,
        index,
    });

    if (!book || !chapter) {
        return (
            <View style={styles.centered}>
                <Text>Chapter not found</Text>
            </View>
        );
    }

    const progress = Math.min(1, (maxIndex + 1) / chapter.pages.length);

    const renderItem: ListRenderItem<ReadingPage> = ({ item }) => {
        if (!listHeight) return null;

        if (item.type === 'end') {
            return (
                <View style={[styles.endContainer, { height: listHeight }]}>
                    <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
                    <Text style={styles.endTitle}>Chapter Complete!</Text>
                    <Text style={styles.endSubtitle}>{chapter.title}</Text>

                    <TouchableOpacity style={styles.backToChaptersButton} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={20} color="#fff" />
                        <Text style={styles.backToChaptersText}>Back to Chapters</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <View style={{ height: listHeight, overflow: 'hidden' }}>
                <PageView
                    page={item.page}
                    chapterTitle={item.pageNumber === 1 ? chapter.title : undefined}
                    pageNumber={item.pageNumber}
                    totalPages={item.totalPages}
                />
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#1f2937" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{chapter.title}</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={{ flex: 1 }} onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}>
                {listHeight > 0 && (
                    <FlatList
                        data={data}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.id}
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
        backgroundColor: '#f9fafb',
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
        backgroundColor: '#fff',
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
        flex: 1,
        padding: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    endTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#1f2937',
        marginTop: 12,
        marginBottom: 6,
    },
    endSubtitle: {
        fontSize: 15,
        color: '#6b7280',
        marginBottom: 24,
        textAlign: 'center',
    },
    backToChaptersButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#3b82f6',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        gap: 8,
    },
    backToChaptersText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
