-- PostgreSQL owns one canonical identity representation for registration,
-- persistence uniqueness, and authentication lookup.
CREATE FUNCTION canonical_email(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
RETURN lower(casefold(btrim(value,
    U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000') COLLATE pg_catalog.pg_unicode_fast) COLLATE pg_catalog.pg_unicode_fast);

-- This intentionally fails when pre-email development users exist. There is no
-- trustworthy email value to derive for those rows; reset that local database.
ALTER TABLE users ADD COLUMN email TEXT COLLATE "C";
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

ALTER TABLE users DROP CONSTRAINT users_username_key;
ALTER TABLE users DROP CONSTRAINT users_username_canonical;
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE users ADD CONSTRAINT users_email_canonical CHECK (
    email <> '' AND email = canonical_email(email)
);
ALTER TABLE users ADD CONSTRAINT users_username_nonblank CHECK (
    btrim(username,
        U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000') <> ''
);

DROP FUNCTION canonical_username(TEXT);
