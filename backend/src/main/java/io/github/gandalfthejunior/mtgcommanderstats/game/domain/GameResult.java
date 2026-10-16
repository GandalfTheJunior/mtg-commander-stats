package io.github.gandalfthejunior.mtgcommanderstats.game.domain;

public enum GameResult {
    WIN, DRAW;

    public static GameResult parse(String value) {
        try {
            return valueOf(value);
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new InvalidGameException();
        }
    }
}
