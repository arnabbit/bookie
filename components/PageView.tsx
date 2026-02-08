import { Page } from '@/types';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
    page: Page;
    chapterTitle?: string;
    pageNumber: number;
    totalPages: number;
}

export default function PageView({ page, chapterTitle, pageNumber, totalPages }: Props) {
    return (
        <View style={styles.container}>
            <View style={styles.card}>
                {chapterTitle && (
                    <Text style={styles.chapterTitle}>{chapterTitle}</Text>
                )}

                <View style={styles.contentContainer}>
                    <Text style={styles.text}>{page.summary}</Text>
                </View>

                <Text style={styles.pageNumber}>{pageNumber} of {totalPages}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#f9fafb',
    },
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
        flex: 1,
        justifyContent: 'space-between',
    },
    chapterTitle: {
        fontSize: 13,
        color: '#9ca3af',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    text: {
        fontSize: 18,
        lineHeight: 28,
        color: '#1f2937',
        textAlign: 'center',
    },
    pageNumber: {
        textAlign: 'center',
        color: '#d1d5db',
        fontSize: 12,
        marginTop: 16,
    },
});
