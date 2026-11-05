package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

public class InvalidCompanionSelectionException extends RuntimeException {
    public InvalidCompanionSelectionException(String detail) {
        super(detail);
    }
}
