# ADR 0003: Defer the UI component library until after the MVP

## Status

Accepted. The post-MVP UI direction is planned, not yet implemented.

## Context

The React/TypeScript frontend currently uses native HTML elements and lightweight
CSS. The MVP prioritizes complete, working Commander flows over polished visual
design. Adopting and migrating to a component library now would divert effort
from unfinished MVP functionality. At the same time, future screens should share
a coherent visual foundation instead of accumulating unrelated styling choices.

## Decision

- Complete the MVP with the existing React/TypeScript approach and lightweight
  CSS. Do not add Material UI or migrate existing screens during MVP development
  solely for visual consistency.
- After MVP completion, introduce Material UI as the intended UI component
  library for the visual redesign. Reassess that choice if concrete requirements
  reveal a material incompatibility before adoption.
- Establish a centralized theme for typography, colors, spacing, and component
  styling before expanding the redesigned interface.
- Migrate existing screens incrementally. Build subsequent frontend features
  using the shared theme and component conventions.
- Keep API access, state handling, and business rules separate from presentation
  where practical. Introduce reusable product-specific components when needed,
  but do not create wrappers around every library primitive speculatively.

## Alternatives considered

- **Adopt Material UI during the MVP:** provides consistent controls sooner, but
  introduces installation and migration work before the MVP is functionally ready.
- **Continue indefinitely with ad hoc CSS:** avoids adopting a library, but risks
  increasingly inconsistent styling as the product expands.
- **Wrap every UI-library primitive:** could simplify some future substitutions,
  but adds abstractions and maintenance cost without a demonstrated need.

## Rationale

Deferring the UI framework keeps MVP work focused while making the intended
post-MVP redesign explicit. A theme and shared, domain-specific components
provide consistency without speculative abstraction layers.

## Consequences and trade-offs

No new frontend dependencies or UI migration are introduced by this decision.
After MVP completion, existing views will require incremental migration, and
legacy CSS may temporarily coexist with Material UI. A later full replacement of
Material UI would still require work; the architecture is optimized for visual
redesign and maintainability, not effortless framework swapping.

Revisit this decision if product requirements or library constraints materially
change before post-MVP adoption.
