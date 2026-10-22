package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

public class InvalidCommanderException extends RuntimeException {
    public InvalidCommanderException() {
        super("Choose one standalone Commander or a legal pair of distinct Commanders and each required color. Printing/artwork changes require the artwork endpoint.");
    }
}
