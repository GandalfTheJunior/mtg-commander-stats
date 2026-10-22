package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

public class InvalidCommanderException extends RuntimeException {
    public InvalidCommanderException() {
        super("Choose exactly one standalone Commander and its required color. Printing/artwork changes require the artwork endpoint.");
    }
}
