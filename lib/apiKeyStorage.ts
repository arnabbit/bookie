import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY_STORAGE_KEY = 'gemini_api_key';
const OPENROUTER_KEY_STORAGE = 'openrouter_api_key';
const OPENROUTER_MODEL_STORAGE = 'openrouter_model';

export const OPENROUTER_MODELS = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super 120B (Free)' },
  { id: 'stepfun/step-3.5-flash:free', label: 'Step 3.5 Flash (Free)' },
  { id: 'arcee-ai/trinity-large-preview:free', label: 'Arcee Trinity Large (Free)' },
  { id: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast' },
];

// Gemini
export async function getApiKey(): Promise<string | null> {
  return AsyncStorage.getItem(API_KEY_STORAGE_KEY);
}
export async function saveApiKey(key: string): Promise<void> {
  await AsyncStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
}
export async function removeApiKey(): Promise<void> {
  await AsyncStorage.removeItem(API_KEY_STORAGE_KEY);
}

// OpenRouter
export async function getOpenRouterKey(): Promise<string | null> {
  return AsyncStorage.getItem(OPENROUTER_KEY_STORAGE);
}
export async function saveOpenRouterKey(key: string): Promise<void> {
  await AsyncStorage.setItem(OPENROUTER_KEY_STORAGE, key.trim());
}
export async function removeOpenRouterKey(): Promise<void> {
  await AsyncStorage.removeItem(OPENROUTER_KEY_STORAGE);
}

export async function getOpenRouterModel(): Promise<string> {
  const model = await AsyncStorage.getItem(OPENROUTER_MODEL_STORAGE);
  return model || OPENROUTER_MODELS[0].id;
}
export async function saveOpenRouterModel(modelId: string): Promise<void> {
  await AsyncStorage.setItem(OPENROUTER_MODEL_STORAGE, modelId);
}
