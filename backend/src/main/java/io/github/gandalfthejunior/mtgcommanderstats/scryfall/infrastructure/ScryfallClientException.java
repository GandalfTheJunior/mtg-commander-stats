package io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure;

public class ScryfallClientException extends RuntimeException {
    private final Kind kind;

    public ScryfallClientException(Kind kind) {
        super("Scryfall request could not be completed.");
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }

    public enum Kind {
        NOT_FOUND, UNAVAILABLE
    }
}
