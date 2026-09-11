# ADR 0002: Use session-based authentication

## Status

Accepted for the web MVP; authentication flows are not implemented in bootstrap.

## Context

The initial client is a browser SPA. Authentication is part of the learning
scope, while native mobile clients, third-party API access, and federation are
not current MVP requirements.

## Decision

Use Spring Security with server-side sessions and established password hashing
and security mechanisms. Do not implement custom cryptography, session
protocols, or password hashing algorithms.

## Alternatives considered

- JWT-based authentication adds token lifecycle, storage, revocation, and refresh
  decisions without a current client requirement that benefits from them.
- Outsourcing authentication immediately to an identity provider can reduce
  credential-management responsibilities but introduces an external dependency
  and moves part of the intended learning scope outside the application.

## Rationale

Server-side sessions fit a browser application and use Spring Security's
established authentication/session support. They keep session invalidation
under server control and avoid introducing a token protocol for the MVP.

## Consequences and trade-offs

The application remains responsible for secure credential handling and account
flows. Future authentication work must address session cookies, CSRF protection,
logout, and server-side authorization. Scaling across application instances may
require a shared session store; none is introduced now.

This decision is not permanent. Revisit JWT or an external identity provider if
future clients or integration requirements justify them. The bootstrap retains
default Spring Security behavior and does not implement these future flows.
