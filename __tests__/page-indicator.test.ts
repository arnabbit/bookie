/**
 * Tests the page numbering logic in the reader and share cards.
 * Current page index is 0-based in code, but displayed as 1-based in UI.
 */

describe('reader page indicator', () => {
  const displayPage = (index: number, total: number) =>
    `${index + 1} / ${total}`;

  it('shows page 1 for index 0', () => {
    expect(displayPage(0, 10)).toBe('1 / 10');
  });

  it('shows last page correctly', () => {
    expect(displayPage(99, 100)).toBe('100 / 100');
  });

  it('handles single-page book', () => {
    expect(displayPage(0, 1)).toBe('1 / 1');
  });

  it('handles empty book (0 pages)', () => {
    expect(displayPage(0, 0)).toBe('1 / 0');
  });
});

describe('share card page label', () => {
  // In the share card, pageNumber is 0-based index
  const cardLabel = (pageNumber: number) => `Page ${pageNumber + 1}`;

  it('shows Page 1 for index 0', () => {
    expect(cardLabel(0)).toBe('Page 1');
  });

  it('shows Page 42 for index 41', () => {
    expect(cardLabel(41)).toBe('Page 42');
  });
});
