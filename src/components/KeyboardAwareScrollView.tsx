import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createThemedStyles } from '../theme/themed-styles';
import {
  getKeyboardAvoidingBehavior,
  getKeyboardAwareScrollDefaults,
  useKeyboardOverlap,
} from './keyboard-policy';

export interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  /** Style applied to the keyboard-avoiding container rather than the ScrollView. */
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * The one keyboard policy used by every Spendly form. iOS uses
 * KeyboardAvoidingView padding. On Android the viewport is shortened by the
 * keyboard overlap actually measured, so it is correct whether or not the OS
 * resized the window, and the native ScrollView then scrolls the focused input
 * into view.
 */
export function KeyboardAwareScrollView({
  children,
  containerStyle,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  keyboardDismissMode,
  automaticallyAdjustKeyboardInsets,
  ...scrollViewProps
}: KeyboardAwareScrollViewProps) {
  const insets = useSafeAreaInsets();
  const defaults = getKeyboardAwareScrollDefaults(Platform.OS as 'ios' | 'android' | 'web');
  const { ref, overlap, onLayout } = useKeyboardOverlap();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={getKeyboardAvoidingBehavior(Platform.OS as 'ios' | 'android' | 'web')}
    >
      <View
        ref={ref}
        onLayout={onLayout}
        style={[styles.container, containerStyle, { paddingBottom: overlap }]}
      >
        <ScrollView
          {...scrollViewProps}
          contentContainerStyle={[{ paddingBottom: Math.max(insets.bottom, 16) }, contentContainerStyle]}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? defaults.keyboardShouldPersistTaps}
          keyboardDismissMode={keyboardDismissMode ?? defaults.keyboardDismissMode}
          automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets ?? defaults.automaticallyAdjustKeyboardInsets}
          nestedScrollEnabled={defaults.nestedScrollEnabled}
        >
          {children}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = createThemedStyles(() => ({
  container: {
    flex: 1,
  },
}));
