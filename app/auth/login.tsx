import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, API_URL } from '@/lib/AuthContext';

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { login } = useAuth();

  const fetchCaptcha = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/captcha`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCaptchaQuestion(data.question);
        setCaptchaId(data.id);
        setCaptchaAnswer('');
      }
    } catch {
      setError('Failed to load captcha');
    }
  };

  useEffect(() => { fetchCaptcha(); }, []);

  const clearFields = () => {
    setUsername('');
    setEmail('');
    setPassword('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!isLogin && !captchaAnswer) {
      setError('Please solve the captcha');
      return;
    }
    if (!username.trim()) { setError('Username is required'); return; }
    if (!isLogin && !email.trim()) { setError('Email is required'); return; }
    if (!password.trim()) { setError('Password is required'); return; }

    setLoading(true);
    setError('');

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const body: any = { username: username.trim().toLowerCase(), password };
    if (!isLogin) {
      body.email = email.trim().toLowerCase();
      body.captchaId = captchaId;
      body.captchaAnswer = parseInt(captchaAnswer);
    }

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Request failed');
        if (data.error?.includes('captcha')) fetchCaptcha();
        return;
      }

      login(data.token, data.user);
      if (Platform.OS === 'web') {
        window.location.href = '/(tabs)/books';
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <Text style={styles.logo}>Booksocial</Text>
        <Text style={styles.subtitle}>Share books with friends</Text>
      </View>

      <View style={styles.form}>
        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, isLogin && styles.tabActive]}
            onPress={() => { setIsLogin(true); clearFields(); fetchCaptcha(); }}
          >
            <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, !isLogin && styles.tabActive]}
            onPress={() => { setIsLogin(false); clearFields(); fetchCaptcha(); }}
          >
            <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Register</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#aaa"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {!isLogin && (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#aaa"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </>
        )}

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#aaa"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        {/* Captcha (register only) */}
        {!isLogin && captchaQuestion && (
          <View style={styles.captchaRow}>
            <Text style={styles.captchaText}>{captchaQuestion} = ?</Text>
            <TextInput
              style={styles.captchaInput}
              placeholder="Answer"
              value={captchaAnswer}
              onChangeText={setCaptchaAnswer}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnLoading]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>
              {isLogin ? 'Login' : 'Register'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  content: {
    alignItems: 'center',
    paddingTop: 80,
  },
  logo: {
    fontSize: 42,
    fontWeight: '800',
    color: '#1a1a2e',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginTop: 8,
  },
  form: {
    paddingHorizontal: 24,
    gap: 8,
  },
  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#6366f1',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#999',
  },
  tabTextActive: {
    color: '#fff',
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#1a1a2e',
  },
  // Captcha
  captchaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  captchaText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  captchaInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#1a1a2e',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  submitBtnLoading: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
