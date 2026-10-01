-- The same boundary-whitespace set used by application DisplayText values.
CREATE FUNCTION display_text_nonblank(value TEXT) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
RETURN btrim(value,
    U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000') <> '';

ALTER TABLE users DROP CONSTRAINT users_username_nonblank;
ALTER TABLE users ADD CONSTRAINT users_username_nonblank CHECK (display_text_nonblank(username));

CREATE TABLE decks (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    commander TEXT NOT NULL,
    color_identity TEXT NOT NULL,
    CONSTRAINT decks_name_nonblank CHECK (display_text_nonblank(name)),
    CONSTRAINT decks_commander_nonblank CHECK (display_text_nonblank(commander)),
    CONSTRAINT decks_color_identity_valid CHECK (color_identity ~ '^W?U?B?R?G?$')
);

CREATE INDEX decks_owner_id_index ON decks(owner_id);
