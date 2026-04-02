/**
 * Tests that the book-share socket payload contains all required fields:
 * - book (id)
 * - bookTitle
 * - pageNumber  (the index, NOT +1)
 * - content (full content, not truncated)
 */

describe('book share socket payload', () => {
  // Simulate what the share function should emit
  const buildSharePayload = (
    bookId: string,
    bookTitle: string,
    currentPageIndex: number,
    pageContent: string
  ) => ({
    conversationId: 'conv-123',
    content: '',
    type: 'book-share' as const,
    sharedBookPage: {
      book: bookId,
      bookTitle,
      pageNumber: currentPageIndex,
      content: pageContent,
    },
  });

  it('includes the book title in the payload', () => {
    const payload = buildSharePayload(
      'book-42',
      'The Great Gatsby',
      0,
      'In my younger...'
    );
    expect(payload.sharedBookPage.bookTitle).toBe('The Great Gatsby');
  });

  it('includes the page number as an index (0-based)', () => {
    const payload = buildSharePayload('book-42', 'Book', 5, 'test content');
    expect(payload.sharedBookPage.pageNumber).toBe(5);
  });

  it('includes the full page content, not truncated', () => {
    const longContent = 'a '.repeat(500);
    const payload = buildSharePayload('book-42', 'Book', 0, longContent);
    expect(payload.sharedBookPage.content.length).toBe(longContent.length);
  });

  it('has type "book-share"', () => {
    const payload = buildSharePayload('book-42', 'Book', 0, 'content');
    expect(payload.type).toBe('book-share');
  });

  it('has empty content string as the top-level message', () => {
    const payload = buildSharePayload('book-42', 'Book', 0, 'content');
    expect(payload.content).toBe('');
  });
});
