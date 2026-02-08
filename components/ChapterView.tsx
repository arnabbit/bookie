import { Chapter } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

const { height } = Dimensions.get('window');

interface Props {
    chapter: Chapter;
    style?: ViewStyle;
    onDetailsPress?: () => void;
}

export default function ChapterView({ chapter, style, onDetailsPress }: Props) {
    if (!chapter) return null;

    return (
        <View style={[styles.container, style]}>
            <View style={styles.contentContainer}>
                <Text style={styles.title}>{chapter.title}</Text>
                <Text style={styles.summary}>{chapter.summary}</Text>

                {onDetailsPress && (
                    <TouchableOpacity style={styles.detailsButton} onPress={onDetailsPress}>
                        <Text style={styles.detailsButtonText}>Read Details</Text>
                        <Ionicons name="arrow-forward" size={16} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: height,
        width: '100%',
        backgroundColor: '#fff',
        padding: 24,
        justifyContent: 'space-between',
        paddingBottom: 80,
        overflow: 'hidden',
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 24,
        color: '#1f2937',
        textAlign: 'center',
    },
    summary: {
        fontSize: 18,
        lineHeight: 28,
        color: '#374151',
        textAlign: 'center',
    },
    detailsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#3b82f6',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        marginTop: 24,
        gap: 8,
    },
    detailsButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
