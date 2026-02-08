import { Link } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Book } from '@/types';

const colorMap: Record<string, string> = {
    'bg-stone-600': '#57534e',
    'bg-blue-700': '#1d4ed8',
};

// Fallback color
const DEFAULT_COLOR = '#4b5563';

interface Props {
    book: Book;
}

export default function BookCard({ book }: Props) {
    const getBackgroundColor = (className: string) => {
        return colorMap[className] || DEFAULT_COLOR;
    };

    return (
        <Link href={`/read/${book.id}`} asChild>
            <TouchableOpacity style={styles.card}>
                <View style={[styles.cover, { backgroundColor: getBackgroundColor(book.coverColor) }]}>
                    <Text style={styles.coverTitle}>{book.title}</Text>
                    <Text style={styles.coverAuthor}>{book.author}</Text>
                </View>
                <View style={styles.info}>
                    <Text style={styles.title} numberOfLines={2}>{book.title}</Text>
                    <Text style={styles.reads}>{book.reads}</Text>
                </View>
            </TouchableOpacity>
        </Link>
    );
}

const styles = StyleSheet.create({
    card: {
        width: '48%',
        marginBottom: 16,
        borderRadius: 8,
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        overflow: 'hidden',
    },
    cover: {
        height: 200,
        padding: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    coverTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 4,
    },
    coverAuthor: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 12,
        textAlign: 'center',
    },
    info: {
        padding: 12,
    },
    title: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
        color: '#1f2937',
    },
    reads: {
        fontSize: 12,
        color: '#6b7280',
    },
});
