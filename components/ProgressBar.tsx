import React from 'react';
import { StyleSheet, View } from 'react-native';

interface Props {
    progress: number;
}

export default function ProgressBar({ progress }: Props) {
    // progress is between 0 and 1

    return (
        <View style={styles.container}>
            <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: 4,
        backgroundColor: '#e5e7eb',
        width: '100%',
        position: 'absolute',
        bottom: 0,
        left: 0,
        zIndex: 10,
    },
    fill: {
        height: '100%',
        backgroundColor: '#3b82f6',
    },
});
