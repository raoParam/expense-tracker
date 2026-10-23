import { Platform } from 'react-native';

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
