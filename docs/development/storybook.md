# Storybook component workshop

Storybook is the development-only component workshop introduced by
[#310](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/310). It
renders individual production components and design experiments in isolation,
in their relevant states, with the production theme. It supports the planned
UI/UX redesign: inventory the existing UI, show candidates next to the current
state and prepare separately approved production migrations.

Showing a component or experiment in Storybook is **neither visual approval nor
implementation authorization**. The [visual design guidelines](../product/visual-design-guidelines.md)
own the approval and promotion process.

## Run and build

From `frontend/`:

```bash
npm run storybook
```

```bash
npm run build-storybook
```

`npm run storybook` starts the development server at <http://localhost:6006>.
`npm run build-storybook` writes a static build to `frontend/storybook-static/`,
which is ignored by Git and ESLint. The required `frontend` CI job runs the static
build, so a story that fails to compile blocks a merge. CI does not render the
stories in a browser.

Storybook is **not published** anywhere and is **not started in Codespaces**. A
later issue decides how the Product Owner opens it on a phone; until then, UI
changes are reviewed through screenshots in the PR.

## Where things live

| Path | Purpose |
| --- | --- |
| `frontend/.storybook/main.ts` | Story locations, addons, telemetry and onboarding switches |
| `frontend/.storybook/preview.tsx` | Production-faithful frame, router context, viewports, sidebar order |
| `frontend/.storybook/Overview.mdx` | The Overview page shown first in the sidebar |
| `frontend/src/**/*.stories.tsx` | Stories, next to the component they show |

Storybook reuses `frontend/vite.config.ts`. The production build starts from
`index.html` and never imports stories or `.storybook/`; the static Storybook
build is a separate output.

## Rendering

Every story is rendered like the application in `main.tsx`: legacy `index.css`
first, then `AppThemeProvider`, under React `StrictMode`. Because `index.css`
still paints a light legacy page, the frame also paints the application surface
(`background.default`, `text.primary`) with 16 px padding.

- `parameters: { surface: false }` removes that frame, for a story that paints its
  own page (for example the theme fixture).
- `parameters: { router: { initialEntries: ['/playgroups'] } }` wraps the story in
  a `MemoryRouter`, for components that render `react-router` links.
- The toolbar offers viewport presets for 320, 375, 390 and 1280 px.

## Adding a story

1. Create `<Component>.stories.tsx` next to the component and give it a `title`
   in one of the sidebar groups:

   | Group | Contents |
   | --- | --- |
   | `Foundations/…` | Theme tokens and themed MUI primitives |
   | `Patterns/…` | Small recurring building blocks used by several screens |
   | `Components/…` | Product-specific components |
   | `Experiments/…` | Non-approved design experiments; add `tags: ['experiment']` |

2. Add one story per relevant state: normal, long names, loading, empty, error,
   disabled or pressed, as applicable.
3. Use local sample data. Stories must not need a backend, a login or any network
   access: do not call `src/api.ts` functions, and leave saved artwork URLs `null`
   so components show their no-artwork fallback. Plain sample builders such as
   `src/test/commanderFixtures.ts` may be reused; fixtures that import Vitest or
   Testing Library may not.
4. Use `fn()` from `storybook/test` for callbacks, so clicks appear in the Actions
   panel.
5. Write sidebar titles, story names and comments in English. Text rendered by the
   components themselves keeps its localized German wording.
6. Run `npm run lint`, `npm run typecheck` and `npm run build-storybook`.

Story files are type-checked and linted with the application code and excluded
from the coverage reports. Stories are not tests: they add no Vitest coverage
and no CI assertions.

### Experiments with global CSS

Playground experiments use plain global CSS, sometimes scoped to an ancestor
class. Supply that ancestor through a story-level decorator, as
`src/playground/WaxSealButton.stories.tsx` does with `.lounge`. Once a story's CSS
has loaded, it stays in the preview while other stories are shown, so check that
its selectors cannot match elements of other stories.

The legacy Playground page and Storybook provide different page-level CSS: the
Playground loads `lounge.css` (border-box sizing, normal line height) but not
`index.css`, while every story loads `index.css` (for example its `main`, `label`
and `button` rules) but not `lounge.css`. Never import `lounge.css` into a story.
Instead, make the experiment's own stylesheet set what it depends on under its
root class, as `mana.css` does for `.mana-page`, and compare the story with
`/dev/lounge.html` before and after.

## Accessibility panel

The **Accessibility** panel runs axe against the current story. It is a review
aid, not a CI gate. Findings in production components are fixed through their
own issues.

## Relation to the other development pages

- `/dev/lounge.html` (legacy Playground) keeps its four complete experiment
  scenes unchanged. Moving individual experiments into isolated stories, and
  eventually retiring the legacy Playground, needs separate issues.
- `/dev/theme.html` remains available. Its fixture also appears as
  `Foundations/Themed controls`.

## Dependency decision

Storybook replaced a self-built "Playground 2.0" workshop (PO decision
2026-11-16, recorded in #310). It provides the catalog, isolated previews,
viewport switching, a controls panel and an accessibility panel without custom
code. All packages are MIT-licensed and free; no hosted service is used.

The devDependencies `storybook`, `@storybook/react-vite`, `@storybook/addon-docs`
and `@storybook/addon-a11y` are pinned to the same 10.6 release by the lockfile.
Their declared peer ranges include Vite 8, React 19 and Vitest 5. Adding them
changed no existing package version. Telemetry, crash reports, update
notifications and the onboarding checklist are disabled in `main.ts`.

The local development server also shows a **+** button for creating story files
from the sidebar. It has no configuration switch; it does not appear in the
static build.
