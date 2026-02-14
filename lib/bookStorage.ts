import AsyncStorage from '@react-native-async-storage/async-storage';
import { Book } from '@/types';

const STORAGE_KEY = 'user_books';

export async function loadUserBooks(): Promise<Book[]> {
  const json = await AsyncStorage.getItem(STORAGE_KEY);
  return json ? JSON.parse(json) : [];
}

export async function saveUserBook(book: Book): Promise<void> {
  const existing = await loadUserBooks();
  existing.push(book);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export async function deleteUserBook(bookId: number): Promise<void> {
  const existing = await loadUserBooks();
  const filtered = existing.filter(b => b.id !== bookId);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}
