import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, TOKEN_KEY } from '../lib/api';

interface User {
  id: string;
  email: string;
  displayName?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore token on app launch
  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync(TOKEN_KEY);
      if (stored) {
        setToken(stored);
        // Fetch user profile
        try {
          const me = await api.auth.me() as User;
          setUser(me);
        } catch {
          // Token expired or invalid — clear it
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          setToken(null);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.auth.login({ email, password });
    await SecureStore.setItemAsync(TOKEN_KEY, res.token);
    setToken(res.token);
    setUser(res.user as User);
  };

  const register = async (email: string, password: string, displayName: string) => {
    const res = await api.auth.register({ email, password, displayName });
    await SecureStore.setItemAsync(TOKEN_KEY, res.token);
    setToken(res.token);
    setUser(res.user as User);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
