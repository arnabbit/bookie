import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { books as hardcodedBooks } from '@/books';
import { deleteUserBook, loadUserBooks, saveUserBook } from './bookStorage';
import { Book } from '@/types';

interface BooksContextValue {
  books: Book[];
  loading: boolean;
  addBook: (book: Book) => Promise<void>;
  deleteBook: (bookId: number) => Promise<void>;
  isUserBook: (bookId: number) => boolean;
  refresh: () => Promise<void>;
}

const BooksContext = createContext<BooksContextValue | null>(null);

export function BooksProvider({ children }: { children: React.ReactNode }) {
  const [userBooks, setUserBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const stored = await loadUserBooks();
    setUserBooks(stored);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const allBooks = [...hardcodedBooks, ...userBooks];

  const addBook = async (book: Book) => {
    await saveUserBook(book);
    await refresh();
  };

  const deleteBook = async (bookId: number) => {
    await deleteUserBook(bookId);
    await refresh();
  };

  const isUserBook = (bookId: number) => userBooks.some(b => b.id === bookId);

  return (
    <BooksContext.Provider value={{ books: allBooks, loading, addBook, deleteBook, isUserBook, refresh }}>
      {children}
    </BooksContext.Provider>
  );
}

export function useBooksContext() {
  const ctx = useContext(BooksContext);
  if (!ctx) throw new Error('useBooksContext must be used within BooksProvider');
  return ctx;
}
