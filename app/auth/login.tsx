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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth, API_URL } from '@/lib/AuthContext';
import { colors, fonts, typography, radius } from '@/lib/theme';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const pwChecks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const pwStrong = Object.values(pwChecks).every(Boolean);
  const pwStarted = password.length > 0;

  const fetchCaptcha = async () => {
    setCaptchaLoading(true);
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
    } finally {
      setCaptchaLoading(false);
    }
  };

  useEffect(() => { fetchCaptcha(); }, []);

  const handleSubmit = async () => {
    if (!username.trim()) { setError('Username is required'); return; }
    if (!password.trim()) { setError('Password is required'); return; }
    if (!pwStrong) { setError('Password does not meet all requirements'); return; }
    if (!captchaAnswer.trim()) { setError('Please solve the verification'); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/auth/enter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
          captchaId,
          captchaAnswer: parseInt(captchaAnswer),
        }),
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
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Brand Section */}
        <View style={styles.brandSection}>
          <View style={styles.brandRow}>
            <Ionicons name="book" size={32} color={colors.tertiary} />
            <Text style={styles.brandName}>Booksocial</Text>
          </View>
          <Text style={styles.heroText}>
            Where thoughts{'\n'}
            <Text style={styles.heroItalic}>find a home.</Text>
          </Text>
          <Text style={styles.heroSubtitle}>
            Join a sanctuary of modern readers. Access your library or create your legacy simply by entering your details.
          </Text>
        </View>

        {/* Form Section */}
        <View style={styles.formSection}>
          <Text style={styles.welcomeTitle}>Welcome back</Text>
          <Text style={styles.welcomeSubtitle}>Continue your reading journey.</Text>

          {/* Username */}
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            placeholder="archivist_01"
            placeholderTextColor={colors.outline}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Password */}
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={colors.outline}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          {pwStarted && !pwStrong && (
            <View style={styles.pwHints}>
              {([
                ['length', '8+'],
                ['upper', 'A-Z'],
                ['lower', 'a-z'],
                ['number', '0-9'],
                ['special', '!@#'],
              ] as const).map(([key, label]) => (
                <View key={key} style={[styles.pwTag, pwChecks[key] && styles.pwTagPass]}>
                  <Text style={[styles.pwTagText, pwChecks[key] && styles.pwTagTextPass]}>{label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Captcha */}
          <Text style={styles.label}>Verification</Text>
          <View style={styles.captchaRow}>
            <View style={styles.captchaBox}>
              {captchaLoading ? (
                <ActivityIndicator size="small" color={colors.tertiary} />
              ) : (
                <Text style={styles.captchaText}>
                  {captchaQuestion}
                </Text>
              )}
            </View>
            <TextInput
              style={styles.captchaInput}
              placeholder="Answer"
              placeholderTextColor={colors.outline}
              value={captchaAnswer}
              onChangeText={setCaptchaAnswer}
              keyboardType="number-pad"
              maxLength={4}
              textAlign="center"
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.9}
            style={styles.submitWrap}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryContainer]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitBtn}
            >
              {loading ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <>
                  <Text style={styles.submitBtnText}>Login / Enter</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.termsText}>
            By entering, you agree to our{' '}
            <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    flexGrow: 1,
  },
  // Brand
  brandSection: {
    paddingHorizontal: 32,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 40,
    backgroundColor: colors.surfaceContainerLow,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  brandName: {
    fontFamily: fonts.headlineBold,
    fontSize: 24,
    fontStyle: 'italic',
    color: colors.onSurface,
    letterSpacing: -0.5,
  },
  heroText: {
    fontFamily: fonts.headlineBold,
    fontSize: 38,
    color: colors.onSurface,
    lineHeight: 46,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  heroItalic: {
    fontFamily: fonts.headlineBoldItalic,
    fontStyle: 'italic',
    color: colors.tertiary,
  },
  heroSubtitle: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurfaceVariant,
    lineHeight: 24,
  },
  // Form
  formSection: {
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 40,
    backgroundColor: colors.surface,
  },
  welcomeTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: 28,
    color: colors.onSurface,
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.onSurfaceVariant,
    marginBottom: 24,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.onSurfaceVariant,
    marginTop: 16,
    marginBottom: 6,
    marginLeft: 4,
  },
  input: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.onSurface,
    borderWidth: 0,
  },
  // Captcha
  captchaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  captchaBox: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captchaText: {
    fontFamily: fonts.headlineBold,
    fontSize: 22,
    color: colors.onSurface,
    letterSpacing: 4,
  },
  captchaInput: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
    letterSpacing: 3,
    color: colors.onSurface,
    borderWidth: 0,
  },
  pwHints: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pwTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.error + '18' },
  pwTagPass: { backgroundColor: '#2e7d3218' },
  pwTagText: { fontSize: 11, fontFamily: fonts.bodyMedium, color: colors.error },
  pwTagTextPass: { color: '#2e7d32' },
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    marginTop: 8,
  },
  // Submit
  submitWrap: {
    marginTop: 20,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  submitBtnText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
  },
  termsText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
  termsLink: {
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
    color: colors.onSurface,
  },
});
