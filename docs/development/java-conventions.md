# Java coding conventions

These conventions apply to backend production and test Java code.

- Declare local variables with explicit types, including try-with-resources variables.
  The repository-owned Checkstyle rule in `backend/checkstyle.xml` enforces this
  during `./mvnw verify` for both source trees.
- Prefer an existing symbolic constant or enum from the relevant API for a
  semantically significant technical value. Otherwise, use a descriptive named
  constant when the value is a deliberate, stable implementation choice and the
  name clarifies its role. Ordinary literals need no constant. Keep stable
  implementation choices in code; use runtime properties for values that genuinely
  vary by environment or deployment.
- Keep a fluent method chain focused on one logical concern. Split a chain into
  separate statements or focused helpers when it combines independent concerns
  and becomes harder to scan.

The last two conventions require judgment in review. Checkstyle does not impose
blanket literal bans or arbitrary chain or statement length limits.
