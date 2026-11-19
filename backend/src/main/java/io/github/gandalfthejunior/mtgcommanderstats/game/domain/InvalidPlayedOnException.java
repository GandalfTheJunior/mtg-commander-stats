package io.github.gandalfthejunior.mtgcommanderstats.game.domain;

public class InvalidPlayedOnException extends RuntimeException {
    private final String code;

    public InvalidPlayedOnException(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }
}
