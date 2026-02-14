import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BookCard from '@/components/BookCard';
import AddBookButton from '@/components/AddBookButton';
import { useBooksContext } from '@/lib/BooksContext';
import { Book } from '@/types';
import { FlatList, ListRenderItem, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function BookCatalogueScreen() {
  const { books } = useBooksContext();
  const router = useRouter();

  const renderItem: ListRenderItem<Book> = ({ item }) => (
    <BookCard book={item} />
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Discover</Text>
            <Text style={styles.headerSubtitle}>Find your next favorite read</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/settings' as any)}
            style={styles.settingsButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={24} color="#6b7280" />
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={books}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
      />
      <AddBookButton />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 24,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  settingsButton: {
    padding: 4,
    marginTop: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
});
