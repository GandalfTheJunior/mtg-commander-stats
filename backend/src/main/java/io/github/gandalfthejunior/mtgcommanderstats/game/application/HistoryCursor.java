package io.github.gandalfthejunior.mtgcommanderstats.game.application;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Base64;
import java.util.UUID;

/** A validated sort position, never an authorization credential. */
public record HistoryCursor(UUID groupId, LocalDate playedOn, Instant recordedAt, UUID gameId) {
    public String encode() {
        String value = "1|" + groupId + "|" + (playedOn == null ? "" : playedOn) + "|" + recordedAt + "|" + gameId;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.US_ASCII));
    }

    public static HistoryCursor decode(String token, UUID groupId) {
        if (token == null) {
            return null;
        }
        try {
            if (token.isEmpty() || token.length() > 256 || !token.matches("[A-Za-z0-9_-]+")) {
                throw new IllegalArgumentException();
            }
            String[] fields = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.US_ASCII).split("\\|", -1);
            if (fields.length != 5 || !fields[0].equals("1")) {
                throw new IllegalArgumentException();
            }
            HistoryCursor cursor = new HistoryCursor(UUID.fromString(fields[1]),
                    fields[2].isEmpty() ? null : LocalDate.parse(fields[2]),
                    Instant.parse(fields[3]), UUID.fromString(fields[4]));
            if (!cursor.groupId().equals(groupId) || !cursor.encode().equals(token)
                    || cursor.recordedAt().isBefore(Instant.parse("0001-01-01T00:00:00Z"))
                    || cursor.recordedAt().isAfter(Instant.parse("9999-12-31T23:59:59.999999Z"))
                    || cursor.recordedAt().getNano() % 1000 != 0
                    || (cursor.playedOn() != null && (cursor.playedOn().getYear() < 1 || cursor.playedOn().getYear() > 9999))) {
                throw new IllegalArgumentException();
            }
            return cursor;
        } catch (IllegalArgumentException | java.time.DateTimeException exception) {
            throw new InvalidHistoryCursorException();
        }
    }
}
