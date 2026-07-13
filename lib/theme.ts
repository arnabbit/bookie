import { Platform, TextStyle } from 'react-native';

// ─── Color Tokens ────────────────────────────────────────
export const colors = {
  surface: '#fcf9f4',
  surfaceContainerLow: '#f6f3ee',
  surfaceContainer: '#f0ede8',
  surfaceContainerHigh: '#ebe8e3',
  surfaceContainerHighest: '#e5e2dd',
  surfaceContainerLowest: '#ffffff',
  onSurface: '#1c1c19',
  onSurfaceVariant: '#44474c',
  primary: '#000000',
  onPrimary: '#ffffff',
  primaryContainer: '#101b30',
  onPrimaryContainer: '#79849d',
  tertiary: '#705d00',
  onTertiary: '#ffffff',
  tertiaryContainer: '#c9a900',
  secondaryContainer: '#f4dcb8',
  secondaryFixedDim: '#dac3a1',
  onSecondaryFixed: '#251a04',
  error: '#ba1a1a',
  outlineVariant: '#c4c6cc',
  outline: '#74777d',
  inverseSurface: '#31302d',
  inverseOnSurface: '#f3f0eb',
};

// ─── Ghost border helper ─────────────────────────────────
export const ghostBorder = (opacity = 0.15) => ({
  borderWidth: 1,
  borderColor: `rgba(196, 198, 204, ${opacity})`,
});

// ─── Typography ──────────────────────────────────────────
export const fonts = {
  headline: Platform.select({ web: 'NotoSerif', default: 'NotoSerif-Regular' }),
  headlineBold: Platform.select({ web: 'NotoSerif', default: 'NotoSerif-Bold' }),
  headlineItalic: Platform.select({ web: 'NotoSerif', default: 'NotoSerif-Italic' }),
  headlineBoldItalic: Platform.select({ web: 'NotoSerif', default: 'NotoSerif-BoldItalic' }),
  body: Platform.select({ web: 'Manrope', default: 'Manrope-Regular' }),
  bodyMedium: Platform.select({ web: 'Manrope', default: 'Manrope-Medium' }),
  bodySemiBold: Platform.select({ web: 'Manrope', default: 'Manrope-SemiBold' }),
  bodyBold: Platform.select({ web: 'Manrope', default: 'Manrope-Bold' }),
  bodyExtraBold: Platform.select({ web: 'Manrope', default: 'Manrope-ExtraBold' }),
};

// ─── Common text styles ──────────────────────────────────
export const typography = {
  displayLg: {
    fontFamily: fonts.headlineBold,
    fontSize: 40,
    fontWeight: '700' as const,
    color: colors.onSurface,
    letterSpacing: -0.5,
  } as TextStyle,
  headlineMd: {
    fontFamily: fonts.headlineBold,
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.onSurface,
    letterSpacing: -0.3,
  } as TextStyle,
  headlineSm: {
    fontFamily: fonts.headlineBold,
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.onSurface,
  } as TextStyle,
  titleLg: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.onSurface,
  } as TextStyle,
  titleMd: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.onSurface,
  } as TextStyle,
  bodyLg: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
    lineHeight: 26,
  } as TextStyle,
  bodyMd: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.onSurface,
    lineHeight: 22,
  } as TextStyle,
  bodySm: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  } as TextStyle,
  labelSm: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    color: colors.onSurfaceVariant,
  } as TextStyle,
  serifItalic: {
    fontFamily: fonts.headlineItalic,
    fontStyle: 'italic' as const,
    fontSize: 16,
    color: colors.onSurface,
    lineHeight: 26,
  } as TextStyle,
};

// ─── Spacing ─────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// ─── Radius ──────────────────────────────────────────────
export const radius = {
  sm: 2,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
};

// ─── Shadows (ambient, not heavy) ────────────────────────
export const shadows = {
  sm: Platform.select({
    ios: { shadowColor: colors.onSurface, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
    android: { elevation: 2 },
    default: {},
  }),
  md: Platform.select({
    ios: { shadowColor: colors.onSurface, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16 },
    android: { elevation: 4 },
    default: {},
  }),
  lg: Platform.select({
    ios: { shadowColor: colors.onSurface, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 24 },
    android: { elevation: 8 },
    default: {},
  }),
};

// ─── Format label mapping (UI display) ───────────────────
export const FORMAT_DISPLAY: Record<string, string> = {
  mini: 'Essentials',
  pro: 'Abridged',
  ultra: 'Full',
};

// Honest, length-describing subtitles for each retelling format.
export const FORMAT_TAGLINE: Record<string, string> = {
  mini: 'shortest retelling',
  pro: 'condensed retelling',
  ultra: 'full-length retelling',
};

export const FORMAT_ACCENT: Record<string, string> = {
  mini: colors.tertiary,
  pro: colors.tertiary,
  ultra: colors.tertiary,
};
