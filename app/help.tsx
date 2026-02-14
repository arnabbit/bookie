import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function HelpSection({
  id,
  icon,
  title,
  children,
  highlighted,
  onLayout,
}: {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
  highlighted?: boolean;
  onLayout?: (y: number) => void;
}) {
  return (
    <View
      style={[styles.section, highlighted && styles.sectionHighlighted]}
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.y)}
    >
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={22} color="#3b82f6" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNumber}>{number}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

export default function HelpScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const sectionPositions = useRef<Record<string, number>>({});

  useEffect(() => {
    if (section) {
      // Small delay to let layout settle
      const timer = setTimeout(() => {
        const y = sectionPositions.current[section];
        if (y !== undefined) {
          scrollRef.current?.scrollTo({ y, animated: true });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [section]);

  const registerPosition = (id: string) => (y: number) => {
    sectionPositions.current[id] = y;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* API Key Setup */}
        <HelpSection
          id="api-key"
          icon="key-outline"
          title="Setting Up Your API Key"
          highlighted={section === 'api-key'}
          onLayout={registerPosition('api-key')}
        >
          <Text style={styles.description}>
            To generate book summaries from PDFs, you need a free Google Gemini API key. Follow these steps:
          </Text>

          <Step number={1} text='Go to aistudio.google.com and sign in with your Google account.' />
          <Step number={2} text='Click "Get API Key" in the top navigation bar.' />
          <Step number={3} text='Click "Create API Key" and select or create a Google Cloud project.' />
          <Step number={4} text='Copy the generated API key.' />
          <Step number={5} text='Open Bookie, go to Settings, and paste the key into the API Key field.' />
          <Step number={6} text={'Tap "Save Key" \u2014 you\'re all set!'} />

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => Linking.openURL('https://aistudio.google.com/apikey')}
          >
            <Ionicons name="open-outline" size={16} color="#3b82f6" />
            <Text style={styles.linkButtonText}>Open Google AI Studio</Text>
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#059669" />
            <Text style={styles.infoText}>
              Your API key is stored only on your device and is never shared with anyone. It is used solely to communicate with Google's Gemini API.
            </Text>
          </View>
        </HelpSection>

        {/* How to Use the App */}
        <HelpSection
          id="how-to-use"
          icon="book-outline"
          title="How to Use Bookie"
          highlighted={section === 'how-to-use'}
          onLayout={registerPosition('how-to-use')}
        >
          <Text style={styles.description}>
            Bookie transforms your PDF books into beautifully narrated chapter summaries you can read on the go.
          </Text>

          <Text style={styles.subheading}>Browse Your Library</Text>
          <Text style={styles.bodyText}>
            The home screen shows your book collection. Tap any book to start reading its chapter summaries. Swipe through chapters and tap "Read Details" to dive into page-by-page narrations.
          </Text>

          <Text style={styles.subheading}>Add a New Book</Text>
          <Text style={styles.bodyText}>
            Tap the blue "+" button at the bottom right of the home screen. Select a PDF file (up to 20MB) from your device. Our AI will analyze the book and generate literary-style summaries for each chapter.
          </Text>

          <Text style={styles.subheading}>Reading Experience</Text>
          <Text style={styles.bodyText}>
            Each book is broken into chapters with warm, first-person narrative summaries. Tap into a chapter to read page-by-page breakdowns — perfect for revisiting key moments or getting the gist of a book quickly.
          </Text>

          <Text style={styles.subheading}>Discover More</Text>
          <Text style={styles.bodyText}>
            When you finish a book, Bookie recommends similar reads from your library based on matching genres and themes.
          </Text>
        </HelpSection>
      </ScrollView>
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
    paddingBottom: 40,
    gap: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  sectionHighlighted: {
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3b82f6',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  linkButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    padding: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#065f46',
    lineHeight: 18,
  },
  subheading: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 12,
    marginBottom: 6,
  },
  bodyText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    marginBottom: 8,
  },
});
