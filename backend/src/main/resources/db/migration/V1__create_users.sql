CREATE TABLE users (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL,
    encoded_password TEXT NOT NULL,
    CONSTRAINT users_username_key UNIQUE (username),
    CONSTRAINT users_username_canonical CHECK (
        username <> '' AND username = lower(username)
        -- Match Java String.strip()/Character.isWhitespace at the storage boundary.
        AND username = btrim(username,
            U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\1680\2000\2001\2002\2003\2004\2005\2006\2008\2009\200A\2028\2029\205F\3000')
    ),
    CONSTRAINT users_encoded_password_nonblank CHECK (btrim(encoded_password) <> '')
);
