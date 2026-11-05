package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

public class InvalidDeckFormatException extends RuntimeException {
    public InvalidDeckFormatException() {
        super("Provide COMMANDER or PAUPER_COMMANDER. Pauper Commander decks cannot have an MTG Companion; explicitly remove it when changing format.");
    }
}
