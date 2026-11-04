package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

import java.net.URI;
import java.net.URISyntaxException;

/** The verified v1 share-link format; validation never accesses the remote resource. */
public record ManaBoxUrl(String value) {
    public ManaBoxUrl {
        if (value == null) {
            throw new InvalidManaBoxUrlException();
        }
        try {
            URI uri = new URI(value).parseServerAuthority();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !"manabox.app".equalsIgnoreCase(uri.getHost())
                    || uri.getRawUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)
                    || !("manabox.app".equalsIgnoreCase(uri.getRawAuthority())
                        || "manabox.app:443".equalsIgnoreCase(uri.getRawAuthority()))
                    || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || uri.getRawPath() == null || !uri.getRawPath().matches("/decks/[A-Za-z0-9_-]+/?")) {
                throw new InvalidManaBoxUrlException();
            }
            String path = uri.getRawPath();
            value = "https://manabox.app" + (path.endsWith("/") ? path.substring(0, path.length() - 1) : path);
        } catch (URISyntaxException exception) {
            throw new InvalidManaBoxUrlException();
        }
    }
}
