-- One source of truth for Unicode Default Caseless Matching, independent of the
-- database/JVM locale. Lowercase the folded result to retain lowercase storage
-- even for scripts whose default casefold representation is uppercase (Cherokee).
CREATE FUNCTION canonical_username(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
RETURN lower(casefold(btrim(value,
    U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000') COLLATE pg_catalog.pg_unicode_fast) COLLATE pg_catalog.pg_unicode_fast);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    username TEXT COLLATE "C" NOT NULL,
    encoded_password TEXT NOT NULL,
    CONSTRAINT users_username_key UNIQUE (username),
    CONSTRAINT users_username_canonical CHECK (
        username <> '' AND username = canonical_username(username)
    ),
    CONSTRAINT users_encoded_password_nonblank CHECK (btrim(encoded_password) <> '')
);
