package io.github.gandalfthejunior.mtgcommanderstats.game.domain;

import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

@Embeddable
public class GameParticipant {
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "deck_id", nullable = false)
    private UUID deckId;

    protected GameParticipant() {
    }

    public GameParticipant(UUID userId, UUID deckId) {
        if (userId == null || deckId == null) {
            throw new InvalidGameException();
        }
        this.userId = userId;
        this.deckId = deckId;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getDeckId() {
        return deckId;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof GameParticipant participant
                && userId.equals(participant.userId) && deckId.equals(participant.deckId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, deckId);
    }
}
