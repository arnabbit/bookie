import BookCard from '@/components/BookCard';
import AddBookButton from '@/components/AddBookButton';
import { useBooksContext } from '@/lib/BooksContext';
import { Book } from '@/types';
import { FlatList, ListRenderItem, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function BookCatalogueScreen() {
  const { books } = useBooksContext();

  const renderItem: ListRenderItem<Book> = ({ item }) => (
    <BookCard book={item} />
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover</Text>
        <Text style={styles.headerSubtitle}>Find your next favorite read</Text>
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
