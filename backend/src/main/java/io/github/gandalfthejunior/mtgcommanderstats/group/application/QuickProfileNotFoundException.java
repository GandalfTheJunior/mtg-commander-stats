package io.github.gandalfthejunior.mtgcommanderstats.group.application;

public class QuickProfileNotFoundException extends RuntimeException {
    public QuickProfileNotFoundException() {
        super("Quick profile not found in this group.");
    }
}
