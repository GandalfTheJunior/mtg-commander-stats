package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

public class DeckNotFoundException extends RuntimeException {
    public DeckNotFoundException() {
        super("Deck not found.");
    }
}
