package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

public class DeckAccessDeniedException extends RuntimeException {
    public DeckAccessDeniedException() {
        super("You do not own this deck.");
    }
}
