import { applyColorTheme, colors, getColorTheme } from '../src/theme/colors';
import { resolveMode } from '../src/context/ThemeContext';

describe('theme regression coverage', () => {
  afterEach(() => applyColorTheme('light'));

  it('switches the active palette immediately', () => {
    applyColorTheme('dark');
    expect(getColorTheme()).toBe('dark');
    expect(colors.background).toBe('#000000');
    expect(colors.surface).toBe('#121212');
    expect(colors.border).toBe('#262626');
    expect(colors.textPrimary).toBe('#FAFAFA');
    expect(colors.textSecondary).toBe('#A8A8A8');
    expect(colors.secondaryBackground).toBe('#1C1C1E');
    expect(colors.secondaryText).toBe('#FAFAFA');
    expect(colors.secondaryBorder).toBe('#262626');
    expect(colors.primaryDark).toBe('#FAFAFA');
  });

  it('preserves exact secondary button tokens in light mode', () => {
    applyColorTheme('light');
    expect(getColorTheme()).toBe('light');
    expect(colors.secondaryBackground).toBe('#EEF2FF');
    expect(colors.secondaryText).toBe('#4338CA');
    expect(colors.secondaryBorder).toBe('transparent');
  });

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
  ] as const)('resolves an explicit %s mode', (mode, expected) => {
    expect(resolveMode(mode, 'dark')).toBe(expected);
  });

  it('follows Android appearance changes in System mode', () => {
    expect(resolveMode('system', 'light')).toBe('light');
    expect(resolveMode('system', 'dark')).toBe('dark');
    expect(resolveMode('system', null)).toBe('light');
  });
});
