import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  isUsernameSet: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  setUsername: (username: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
const STORAGE_KEYS = { token: '@booksocial_token', user: '@booksocial_user' };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const storedToken = await AsyncStorage.getItem(STORAGE_KEYS.token);
      const storedUser = await AsyncStorage.getItem(STORAGE_KEYS.user);
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        // Validate token
        try {
          const res = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data);
            await AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(data));
          } else {
            await AsyncStorage.multiRemove([STORAGE_KEYS.token, STORAGE_KEYS.user]);
            setToken(null);
            setUser(null);
          }
        } catch {
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  const login = async (jwtToken: string, userData: User) => {
    setToken(jwtToken);
    setUser(userData);
    await AsyncStorage.setItem(STORAGE_KEYS.token, jwtToken);
    await AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(userData));
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    await AsyncStorage.multiRemove([STORAGE_KEYS.token, STORAGE_KEYS.user]);
  };
  const setUsername = async (username: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`${API_URL}/api/auth/username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setUser(data);
      await AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, setUsername }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export { API_URL };
