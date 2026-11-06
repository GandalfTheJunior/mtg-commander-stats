-- Usernames are case-insensitively unique (#214). The stored username keeps the
-- user's chosen NFC/trimmed spelling (V16); uniqueness applies to this canonical
-- form. PostgreSQL owns the folding, like canonical_email, so registration and the
-- index use one Unicode Default Caseless Matching implementation. Lowercase the
-- folded value as canonical_email does (Cherokee folds to uppercase), then NFC
-- normalize because case folding can decompose characters.
CREATE FUNCTION canonical_username(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
RETURN normalize(lower(casefold(value COLLATE pg_catalog.pg_unicode_fast) COLLATE pg_catalog.pg_unicode_fast), NFC);

-- Refuse the upgrade without renaming or exposing development/demo data. There
-- are no production users; reset the database before retrying.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users GROUP BY canonical_username(username) HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Case-insensitively duplicate users.username values exist. Reset nonconforming development/demo data before retrying the migration.';
    END IF;
END $$;

-- Quick profiles (#223) will restrict this index to accounts by recreating it with
-- the same expression and a WHERE kind = 'ACCOUNT' predicate.
CREATE UNIQUE INDEX users_username_canonical_key ON users (canonical_username(username));
