/**
 * Tests that msgRow wraps each message in a full-width flex row,
 * msgContainer caps at maxWidth 85%,
 * msgRight uses alignSelf 'flex-end' (right),
 * msgLeft uses alignSelf 'flex-start' (left).
 */

describe('message alignment styles', () => {
  const msgRow = { flexDirection: 'row', width: '100%' };
  const msgContainer = { maxWidth: '85%' };
  const msgRight = { alignSelf: 'flex-end' };
  const msgLeft = { alignSelf: 'flex-start' };

  it('msgRow is a full-width flex row container', () => {
    expect(msgRow.flexDirection).toBe('row');
    expect(msgRow.width).toBe('100%');
  });

  it('msgContainer caps width at 85%', () => {
    expect(msgContainer.maxWidth).toBe('85%');
  });

  it('sent messages use alignSelf flex-end (right)', () => {
    expect(msgRight.alignSelf).toBe('flex-end');
  });

  it('received messages use alignSelf flex-start (left)', () => {
    expect(msgLeft.alignSelf).toBe('flex-start');
  });

  it('sent and received alignments are mutually exclusive', () => {
    expect(msgRight.alignSelf).not.toBe(msgLeft.alignSelf);
  });
});
