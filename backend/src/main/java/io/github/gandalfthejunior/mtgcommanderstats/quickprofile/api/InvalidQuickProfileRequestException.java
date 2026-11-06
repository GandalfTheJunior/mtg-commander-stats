package io.github.gandalfthejunior.mtgcommanderstats.quickprofile.api;

public class InvalidQuickProfileRequestException extends RuntimeException {
    public InvalidQuickProfileRequestException() {
        super("Provide only the documented request fields.");
    }
}
