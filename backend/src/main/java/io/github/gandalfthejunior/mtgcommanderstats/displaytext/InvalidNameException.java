package io.github.gandalfthejunior.mtgcommanderstats.displaytext;

public class InvalidNameException extends IllegalArgumentException {
    public enum Reason {
        BLANK, INVALID_CHARACTERS, TOO_LONG
    }

    private final Reason reason;
    private final int maxLength;

    public InvalidNameException(Reason reason, int maxLength) {
        super(switch (reason) {
            case BLANK -> "Name must not be blank.";
            case INVALID_CHARACTERS -> "Name contains unsupported characters or repeated spaces.";
            case TOO_LONG -> "Name must be at most " + maxLength + " characters long.";
        });
        this.reason = reason;
        this.maxLength = maxLength;
    }

    public Reason reason() {
        return reason;
    }

    public int maxLength() {
        return maxLength;
    }
}
