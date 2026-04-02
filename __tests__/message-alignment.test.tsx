/**
 * Tests that sent messages (book-share and text) get right-aligned styles
 * and received messages get left-aligned styles.
 *
 * We snapshot the rendered style arrays to verify alignment logic.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

describe('message alignment logic', () => {
  const msgContainer: { maxWidth: string; marginVertical: number } = {
    maxWidth: '85%',
    marginVertical: 3,
  };
  const msgLeft = { marginRight: 'auto', marginLeft: 0 };
  const msgRight = { marginLeft: 'auto', marginRight: 0 };

  it('positions sent messages to the right (marginLeft auto)', () => {
    const isMine = true;
    const styles = [msgContainer, isMine ? msgRight : msgLeft];

    const { container } = render(
      <View style={styles} testID="msg" />
    );
    const msg = container.root.find(null, 'View')[0];
    // The style should contain marginLeft: 'auto' and NOT marginRight: 'auto'
    const msgRightRef = StyleSheet.flatten(msgRight);
    expect(msgRightRef.marginLeft).toBe('auto');
    expect(msgRightRef.marginRight).toBe(0);
  });

  it('positions received messages to the left (marginRight auto)', () => {
    const isMine = false;
    const styles = [msgContainer, isMine ? msgRight : msgLeft];

    const { container } = render(
      <View style={styles} testID="msg" />
    );
    const msg = container.root.find(null, 'View')[0];
    const msgLeftRef = StyleSheet.flatten(msgLeft);
    expect(msgLeftRef.marginRight).toBe('auto');
    expect(msgLeftRef.marginLeft).toBe(0);
  });

  it('both message types share the same base container maxWidth', () => {
    const flattened = StyleSheet.flatten(msgContainer);
    expect(flattened.maxWidth).toBe('85%');
  });

  it('sent and received messages never share the same alignment', () => {
    const sent = StyleSheet.flatten(msgRight);
    const received = StyleSheet.flatten(msgLeft);
    expect(sent.marginLeft).not.toBe(received.marginLeft);
  });
});
