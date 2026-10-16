import { createTheme } from '@mui/material/styles'
import type { CSSProperties } from 'react'

declare module '@mui/material/styles' {
  interface TypeBackground {
    raised: string
  }
  interface Palette {
    interaction: {
      border: string
      focus: string
      hover: string
      pressed: string
      primaryHover: string
    }
  }
  interface PaletteOptions {
    interaction?: Palette['interaction']
  }
  interface TypographyVariants {
    wordmark: CSSProperties
    numeric: CSSProperties
  }
  interface TypographyVariantsOptions {
    wordmark?: CSSProperties
    numeric?: CSSProperties
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    wordmark: true
    numeric: true
  }
}

// Keep product colors here. Screens consume semantic theme tokens through sx.
export const appTheme = createTheme({
  palette: {
    mode: 'dark',
    contrastThreshold: 4.5,
    background: { default: '#19171B', paper: '#29242A', raised: '#342A31' },
    primary: { main: '#854358', light: '#C98C9F', dark: '#71364A', contrastText: '#F4EBDF' },
    secondary: { main: '#DBB977', light: '#E5C990', dark: '#C6A05E', contrastText: '#19171B' },
    success: { main: '#A6CFAB', light: '#C1DFC4', dark: '#8BB990', contrastText: '#19171B' },
    warning: { main: '#E6C17E', light: '#F0D5A2', dark: '#CCAA67', contrastText: '#19171B' },
    error: { main: '#FFB4AB', light: '#FFDAD5', dark: '#E59B93', contrastText: '#19171B' },
    info: { main: '#AFC8F5', light: '#D4E2FC', dark: '#94AFDC', contrastText: '#19171B' },
    text: { primary: '#F4EBDF', secondary: '#CDBFB3', disabled: '#AA96A1' },
    divider: '#5B4B54', // Decorative only; never a control boundary.
    action: { disabled: '#AA96A1', disabledBackground: '#342A31' },
    interaction: {
      border: '#AA96A1',
      focus: '#DBB977',
      hover: '#342A31',
      pressed: '#392C35',
      primaryHover: '#96516A',
    },
  },
  spacing: 8,
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 16,
    body1: { fontSize: '1rem', lineHeight: 1.5 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
    button: { fontSize: '1rem', fontWeight: 600, textTransform: 'none' },
    wordmark: { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '2rem', fontWeight: 500, lineHeight: 1.2 },
    numeric: { fontSize: '1rem', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' },
  },
  components: {
    MuiTypography: {
      defaultProps: { variantMapping: { wordmark: 'span', numeric: 'span' } },
    },
    MuiPaper: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundImage: 'none', // No implicit dark elevation tint.
          borderRadius: theme.shape.borderRadius,
        }),
      },
    },
    MuiCard: { styleOverrides: { root: { borderRadius: 16 } } },
    MuiButton: {
      defaultProps: { disableElevation: true, disableRipple: true },
      styleOverrides: {
        root: ({ theme, ownerState }) => {
          const colorName = ownerState.color === 'inherit' ? 'primary' : ownerState.color ?? 'primary'
          const color = theme.palette[colorName]
          const foreground = colorName === 'primary' ? color.light : color.main
          const contained = ownerState.variant === 'contained'
          return {
            minHeight: 48,
            minWidth: 48,
            padding: theme.spacing(1, 2),
            overflowWrap: 'anywhere',
            border: `1px solid ${contained ? color.light : 'transparent'}`,
            ...(contained ? {
              color: color.contrastText,
              backgroundColor: color.main,
              '&:hover': {
                backgroundColor: colorName === 'primary'
                  ? theme.palette.interaction.primaryHover : color.light,
              },
              '&:active': { backgroundColor: color.dark },
            } : {
              color: foreground,
              ...(ownerState.variant === 'outlined' && { borderColor: foreground }),
              '&:hover': { backgroundColor: theme.palette.interaction.hover, borderColor: foreground },
              '&:active': { backgroundColor: theme.palette.interaction.pressed },
            }),
            '&[aria-pressed="true"]': {
              boxShadow: 'inset 0 0 0 2px currentColor',
              textDecoration: 'underline',
              textUnderlineOffset: '0.2em',
            },
            '&.Mui-focusVisible, &:focus-visible': {
              outline: `3px solid ${theme.palette.interaction.focus}`,
              outlineOffset: 3,
            },
            '&.Mui-disabled': {
              color: theme.palette.text.disabled,
              backgroundColor: theme.palette.action.disabledBackground,
              borderColor: theme.palette.interaction.border,
              opacity: 1, // Defeat legacy button:disabled opacity, for readable text.
            },
          }
        },
      },
    },
    MuiTextField: { defaultProps: { variant: 'outlined' } },
    MuiInputLabel: {
      styleOverrides: {
        root: ({ theme }) => ({
          display: 'block',
          color: theme.palette.text.secondary,
          '&.Mui-focused': { color: theme.palette.interaction.focus },
          '&.Mui-error': { color: theme.palette.error.main },
          '&.Mui-disabled': { color: theme.palette.text.disabled },
        }),
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          minHeight: 48,
          backgroundColor: theme.palette.background.paper,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.interaction.border },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.text.primary },
          '&.Mui-focused': { outline: `2px solid ${theme.palette.interaction.focus}`, outlineOffset: 2 },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.interaction.focus },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.error.main, borderWidth: 2 },
          '&.Mui-disabled': { backgroundColor: theme.palette.background.raised },
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.interaction.border },
        }),
        input: ({ theme }) => ({
          minWidth: 0,
          '&:focus': { outline: 'none' }, // Remove only this MUI input's legacy focus reset.
          '&.Mui-disabled': { WebkitTextFillColor: theme.palette.text.disabled, opacity: 1 },
        }),
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontSize: '0.875rem',
          '&.Mui-disabled': { color: theme.palette.text.disabled },
        }),
      },
    },
  },
})
