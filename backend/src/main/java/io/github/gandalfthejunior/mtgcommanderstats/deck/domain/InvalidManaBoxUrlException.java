package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

public class InvalidManaBoxUrlException extends RuntimeException {
    public InvalidManaBoxUrlException() {
        super("Provide a public HTTPS ManaBox deck share URL without extra paths, query or fragment.");
    }
}
