import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';

export function getKeyboardAwareScrollDefaults(
  platform: 'ios' | 'android' | 'web' = Platform.OS as 'ios' | 'android' | 'web'
) {
  return {
    keyboardShouldPersistTaps: 'handled' as const,
    keyboardDismissMode: platform === 'ios' ? ('interactive' as const) : ('on-drag' as const),
    automaticallyAdjustKeyboardInsets: platform === 'ios',
    nestedScrollEnabled: false,
  };
}

export function getKeyboardAvoidingBehavior(
  platform: 'ios' | 'android' | 'web' = Platform.OS as 'ios' | 'android' | 'web'
): 'padding' | undefined {
  // Android's adjustResize changes the ScrollView viewport. A KAV height
  // adjustment on top of that is the source of the old jumps and blank space.
  return platform === 'ios' ? 'padding' : undefined;
}

/**
 * Height of the keyboard that actually covers the bottom of the measured view.
 * Measured against the real keyboard frame, so it is 0 when Android already
 * resized the window and the full overlap when it did not (edge-to-edge,
 * Modal windows). Apply it as paddingBottom on the measured view itself.
 */
export function useKeyboardOverlap() {
  const ref = useRef<View>(null);
  const keyboardTop = useRef<number | null>(null);
  const [overlap, setOverlap] = useState(0);

  const measure = useCallback(() => {
    const top = keyboardTop.current;
    if (top == null) return setOverlap(0);
    ref.current?.measureInWindow((_x, y, _w, h) => setOverlap(Math.max(Math.round(y + h - top), 0)));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      measure();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setOverlap(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [measure]);

  return { ref, overlap, onLayout: measure };
}
