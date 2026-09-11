# ADR 0001: Use a modular monolith

## Status

Accepted for architecture v1.

## Context

This is a small Commander statistics application and a learning project for
AI-assisted software engineering. It needs clear ownership and understandable
changes without distributed-system overhead or abstractions for unknown needs.

## Decision

Three related but distinct decisions apply:

1. **Application/deployment architecture:** one Spring Boot modular monolith,
   initially one Maven module, backed by PostgreSQL.
2. **Code organization:** primarily package-by-feature, with API, application,
   domain, and persistence responsibilities introduced as needed inside features.
3. **Abstraction style:** no full ports-and-adapters/hexagonal ceremony at this
   stage. Use Spring Data JPA directly where appropriate and add an abstraction
   only for a concrete problem.

## Alternatives considered

- Microservices would provide independent deployment and scaling, but add remote
  communication, operational complexity, and distributed data consistency work.
- Global controller/service/repository packages are familiar, but scatter the
  code needed to understand one business feature.
- Full hexagonal architecture can isolate infrastructure and support alternative
  adapters, but those needs have not been established for this MVP.

## Rationale

A single application keeps local development, testing, transactions, and review
manageable. Feature ownership gives the code room to grow without requiring
separate services or interfaces for every collaboration.

## Consequences and trade-offs

Features share one runtime and deployment lifecycle. Boundaries initially rely
on clear code ownership and review rather than a module enforcement framework.
Some application code may depend on Spring/JPA. These are deliberate costs for
the current scope; revisit them when concrete scale, ownership, or integration
requirements justify a change. No deployment is implemented by the bootstrap.
