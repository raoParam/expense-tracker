import React, { useCallback, useRef } from 'react';
import {
  KeyboardAvoidingView,
  findNodeHandle,
  InteractionManager,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createThemedStyles } from '../theme/themed-styles';
import {
  getKeyboardAvoidingBehavior,
  getKeyboardAwareScrollDefaults,
} from './keyboard-policy';

export interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  /** Style applied to the keyboard-avoiding container rather than the ScrollView. */
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * The one keyboard policy used by every Spendly form and input modal.
 * Android's resize mode supplies the viewport change; adding a second height
 * adjustment on top of it is what caused the old layout jumps and blank space.
 */
export function KeyboardAwareScrollView({
  children,
  containerStyle,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  keyboardDismissMode,
  automaticallyAdjustKeyboardInsets,
  scrollsChildToFocus = true,
  onFocus,
  ...scrollViewProps
}: KeyboardAwareScrollViewProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const keyboardDefaults = getKeyboardAwareScrollDefaults(Platform.OS as 'ios' | 'android' | 'web');

  const handleFocus = useCallback<NonNullable<ScrollViewProps['onFocus']>>(
    (event) => {
      onFocus?.(event);

      // RN exposes this responder method specifically for use from a parent
      // view's TextInput onFocus callback. It works for FormField and raw
      // TextInput controls without requiring a separate keyboard library.
      const target = findNodeHandle(event.nativeEvent.target);
      if (target == null) return;

      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          scrollViewRef.current?.scrollResponderScrollNativeHandleToKeyboard(
            target,
            0,
            true
          );
        });
      });
    },
    [onFocus]
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, containerStyle]}
      behavior={getKeyboardAvoidingBehavior(Platform.OS as 'ios' | 'android' | 'web')}
    >
      <ScrollView
        ref={scrollViewRef}
        {...scrollViewProps}
        contentContainerStyle={[
          { paddingBottom: Math.max(insets.bottom, 16) },
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? keyboardDefaults.keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode ?? keyboardDefaults.keyboardDismissMode}
        automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets ?? keyboardDefaults.automaticallyAdjustKeyboardInsets}
        scrollsChildToFocus={scrollsChildToFocus}
        nestedScrollEnabled={false}
        {...({ onFocusCapture: handleFocus } as unknown as ScrollViewProps)}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = createThemedStyles(() => ({
  container: {
    flex: 1,
  },
}));
