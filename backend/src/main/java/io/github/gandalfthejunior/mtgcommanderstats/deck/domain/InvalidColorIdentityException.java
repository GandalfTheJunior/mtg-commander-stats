package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

public class InvalidColorIdentityException extends IllegalArgumentException {
    public InvalidColorIdentityException() {
        super("Color identity must contain distinct W, U, B, R, or G symbols.");
    }
}
