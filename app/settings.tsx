import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiKey, removeApiKey, saveApiKey } from '@/lib/apiKeyStorage';

export default function SettingsScreen() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    getApiKey().then((key) => {
      if (key) {
        setApiKey(key);
        setHasExistingKey(true);
      }
    });
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      if (Platform.OS === 'web') {
        alert('Please enter a valid API key.');
      } else {
        Alert.alert('Invalid Key', 'Please enter a valid API key.');
      }
      return;
    }
    await saveApiKey(trimmed);
    setHasExistingKey(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [apiKey]);

  const handleRemove = useCallback(async () => {
    await removeApiKey();
    setApiKey('');
    setHasExistingKey(false);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* API Key Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Gemini API Key</Text>
            <TouchableOpacity
              onPress={() => router.push('/help?section=api-key' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="help-circle-outline" size={22} color="#3b82f6" />
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionDescription}>
            Your API key is stored locally on your device and is used to generate book summaries from PDFs.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Paste your Gemini API key here"
            placeholderTextColor="#9ca3af"
            value={apiKey}
            onChangeText={setApiKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={false}
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={18} color="#fff" />
              <Text style={styles.saveButtonText}>{saved ? 'Saved!' : 'Save Key'}</Text>
            </TouchableOpacity>

            {hasExistingKey && (
              <TouchableOpacity style={styles.removeButton} onPress={handleRemove}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1f2937',
  },
  sectionDescription: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 6,
  },
  removeButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
});
