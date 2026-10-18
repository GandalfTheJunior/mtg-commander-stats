# Frontend theme and incremental adoption

The post-MVP Material UI foundation implements [ADR 0003](../architecture/adr/0003-defer-ui-framework-until-after-mvp.md)
and the [shared visual system](../product/frontend-redesign.md#shared-visual-system).
Issue #71 records the PO's 2026-10-16 confirmation that the MVP sequencing gate
is satisfied. Existing product screens continue to use native HTML and legacy CSS.

## Dependencies

`@mui/material` 9.5.0 supports React/React DOM `^19.0.0`, including this project's
19.2.8. The installed package's peer metadata and MUI's official
[installation guide](https://mui.com/material-ui/getting-started/installation/)
confirm compatibility. `@emotion/react` 11.14.0 and `@emotion/styled` 11.14.1 are
the standard styling engine and its required React integration. The lockfile pins
the resolved tree; use Node 24 and `npm ci`. No icons, font packages, alternative
styling engine or CDN fonts are required. Shared Babel utilities now also have
production dependency paths through Emotion; this accounts for removed `dev`
flags in the lockfile, without upgrading the existing locked packages.

## Tokens and use

`frontend/src/theme/theme.ts` owns the typed `appTheme`; `AppThemeProvider.tsx`
provides it at the application root. Use MUI primitives directly, for example:

```tsx
<Card sx={{ p: 2 }}>
  <Typography component="h2" variant="h6">Decks</Typography>
  <Typography sx={{ color: 'text.secondary' }}>Your Commander collection</Typography>
  <Typography variant="numeric">58.33%</Typography>
  <Button variant="contained">Create deck</Button>
</Card>
```

- `background.default`, `background.paper`, `background.raised`: page, card and
  raised surfaces. Set a migrated container's background and `text.primary`
  explicitly; ThemeProvider does not repaint native elements.
- `primary.main`: burgundy **action fill**, with `primary.contrastText`.
  `primary.light` is the readable burgundy text/outline token on dark surfaces;
  do not use the darker fill color for ordinary text there.
- `secondary.main`: muted gold accent. Success, warning, error and info use the
  corresponding semantic palette entries. In `sx`, use paths such as
  `color: 'error.main'`; labels/messages and ARIA state must also convey meaning.
- `interaction.border`, `interaction.focus`, `interaction.hover`,
  `interaction.pressed` and `interaction.primaryHover`: control boundaries and
  interaction surfaces. `divider` is decorative only.
- `text.primary`, `text.secondary`, `text.disabled`, `action.disabledBackground`:
  opaque readable text and unavailable controls. Do not apply extra disabled
  opacity. Disabled native attributes still provide actual disabled behavior.
- `spacing` uses 8px units (`p: 2` = 16px); base corners are 12px, cards 16px.
  Buttons are at least 48px high/wide; outlined inputs are at least 48px high.
- System sans-serif is the app default; `wordmark` alone uses local Georgia/serif.
  `numeric` supplies tabular figures. Custom variants default to `span`; choose
  heading semantics with `component` where appropriate.

Buttons have hover/pressed styling, explicit keyboard outlines and disabled
styling. `Button color="inherit"` retains MUI's inherited foreground and neutral
variant backgrounds, with the same shared size, focus and disabled treatment.
Choose a parent color with sufficient contrast against its surrounding surface
and MUI's neutral contained hover fill. The fixture includes all three variants
inside a pale-blue parent. `AppThemeProvider.test.tsx` checks inherited foreground
color for each variant. Toggle buttons using these primitives must set
`aria-pressed`; a selected button gains an inset stroke and underline.
TextFields need stable IDs, visible
labels, explanatory `helperText`, and `error` for validation (color alone is
insufficient). No product-specific wrappers are needed for this foundation.

## Coexistence and fixture

There is deliberately **no CssBaseline or global theme reset**. Emotion retains
its default insertion order after `index.css`; do not add `injectFirst` while
legacy type selectors coexist. MUI-specific overrides neutralize the legacy
input focus outline and button disabled opacity only on the corresponding MUI
components. Remaining native authentication/legacy panels keep their existing CSS. Migrated
statistics consume the theme directly and no longer use the light `.legacy-view`
wrapper or legacy statistics selectors; API and request lifetimes are preserved. New global resets require a separate
review of native forms; do not assume ThemeProvider scopes global CSS.

Run `npm run dev` in `frontend/`, then open `/dev/theme.html`. This separate
development HTML entry imports the same legacy CSS and provider as the app and
shows Button, TextField, Card and raised Paper, long text, statuses, disabled
controls, selection and validation. Tab through the controls; submit an empty
name and correct it. The fixture has no API access, is not linked from the app,
is guarded by `import.meta.env.DEV`, and is not a production build entry.
`ThemeFixture.test.tsx` checks observable validation, labelling and selection;
the existing `App.test.tsx` flows also run under the production provider.

## Rendered contrast verification

Chrome computed styles were sampled with `index.css` loaded, after hover/pressed
transitions, and with actual Tab focus. Relative luminance ratios use the WCAG
sRGB formula and the effective opaque ancestor background (including disabled
input text fill). These are measurements of the representative fixture, not a
claim about every possible future component or background combination.

| Rendered presentation | Contrast ratio |
| --- | ---: |
| Cream wordmark / page | 15.08:1 |
| Cream input/content / paper | 12.89:1 |
| Secondary text / raised surface | 7.69:1 |
| Primary button text, normal / hover / pressed | 6.05 / 4.83 / 7.64:1 |
| Primary button boundary / surrounding paper | 5.61:1 |
| Primary text action, hover / pressed | 5.08 / 4.88:1 |
| Gold selection text/stroke, normal / hover / pressed | 8.13 / 7.37 / 7.07:1 |
| Gold keyboard outline / surrounding paper (including focused error input) | 8.13:1 |
| Input boundary / paper | 5.50:1 |
| Error helper text and input boundary / paper | 8.96:1 |
| Disabled button/input text / raised disabled fill | 4.99:1 |
| Success / warning / error / info text on raised surface | 7.98 / 8.08 / 8.13 / 8.15:1 |
| Inherited pale-blue text/outline, normal / hover / pressed on raised surface | 10.57 / 8.43 / 8.43:1 |
| Inherited pale-blue contained text, normal / hover / pressed | 7.70 / 4.74 / 4.74:1 |

Ordinary text clears AA 4.5:1, applicable boundaries/focus indicators 3:1.
The primary fill alone has insufficient boundary contrast against paper; its
lighter explicit border provides the boundary. Focus outlines are offset onto
the surrounding surface. Disabled controls are exempt from those WCAG contrast
criteria, but these examples still clear 4.5:1. Decorative dividers need not
clear 3:1 and must not carry essential state. Check additional combinations when
migrating screens, especially links, other button colors and other primitives.

Visual inspection at 320px, 390px and 1280px covered the fixture, long text,
keyboard focus and existing native auth/protected forms. Browser smoke checks
use intercepted fixture API responses; they supplement existing frontend tests
and do not establish backend end-to-end acceptance or screen-reader support.
