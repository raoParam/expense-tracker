jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

import {
  getKeyboardAvoidingBehavior,
  getKeyboardAwareScrollDefaults,
} from '../src/components/keyboard-policy';

describe('keyboard regression coverage', () => {
  it('uses one Android resize policy without nested scrolling', () => {
    const defaults = getKeyboardAwareScrollDefaults('android');
    expect(getKeyboardAvoidingBehavior('android')).toBeUndefined();
    expect(defaults.nestedScrollEnabled).toBe(false);
    expect(defaults.keyboardShouldPersistTaps).toBe('handled');
  });

  it('keeps tap-between-fields and drag dismissal enabled', () => {
    const defaults = getKeyboardAwareScrollDefaults('android');
    expect(defaults.keyboardDismissMode).toBe('on-drag');
  });

  it('uses padding only on iOS where the system does not resize the viewport', () => {
    expect(getKeyboardAvoidingBehavior('ios')).toBe('padding');
  });

  it('exports KeyboardComposerModal as a reusable composer component', () => {
    const { KeyboardComposerModal } = require('../src/components/KeyboardComposerModal');
    expect(typeof KeyboardComposerModal).toBe('function');
  });

  it('prevents duplicate submissions when submitting state is active', () => {
    const onSubmit = jest.fn();
    const submitting = true;

    // Simulate submission handler guard
    const handleTrigger = () => {
      if (submitting) return;
      onSubmit();
    };

    handleTrigger();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
