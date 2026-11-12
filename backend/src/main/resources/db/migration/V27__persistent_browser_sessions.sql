-- #303: durable server-side browser sessions (Spring Session JDBC).
-- Official Spring Session PostgreSQL schema, placed in a dedicated schema so
-- that temporary session records stay separate from application data in
-- `public` (demo seeding, data-only exports, empty-database checks).
-- Flyway owns this schema; Spring Session's own initializer is disabled.
CREATE SCHEMA session_store;

CREATE TABLE session_store.spring_session (
    primary_id CHAR(36) NOT NULL,
    session_id CHAR(36) NOT NULL,
    creation_time BIGINT NOT NULL,
    last_access_time BIGINT NOT NULL,
    max_inactive_interval INT NOT NULL,
    expiry_time BIGINT NOT NULL,
    principal_name VARCHAR(100),
    CONSTRAINT spring_session_pk PRIMARY KEY (primary_id)
);

CREATE UNIQUE INDEX spring_session_ix1 ON session_store.spring_session (session_id);
-- Supports the periodic bounded delete of expired rows.
CREATE INDEX spring_session_ix2 ON session_store.spring_session (expiry_time);
CREATE INDEX spring_session_ix3 ON session_store.spring_session (principal_name);

CREATE TABLE session_store.spring_session_attributes (
    session_primary_id CHAR(36) NOT NULL,
    attribute_name VARCHAR(200) NOT NULL,
    attribute_bytes BYTEA NOT NULL,
    CONSTRAINT spring_session_attributes_pk PRIMARY KEY (session_primary_id, attribute_name),
    CONSTRAINT spring_session_attributes_fk FOREIGN KEY (session_primary_id)
        REFERENCES session_store.spring_session (primary_id) ON DELETE CASCADE
);
