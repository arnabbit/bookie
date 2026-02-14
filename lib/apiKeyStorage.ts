import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY_STORAGE_KEY = 'gemini_api_key';

export async function getApiKey(): Promise<string | null> {
  return AsyncStorage.getItem(API_KEY_STORAGE_KEY);
}

export async function saveApiKey(key: string): Promise<void> {
  await AsyncStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
}

export async function removeApiKey(): Promise<void> {
  await AsyncStorage.removeItem(API_KEY_STORAGE_KEY);
}
