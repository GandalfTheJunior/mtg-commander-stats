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

    @Column(name = "start_position", nullable = false)
    private int startPosition;

    @Column(name = "placement")
    private Integer placement;

    @Column(name = "winner")
    private Boolean winner;

    @Column(name = "still_in_game")
    private Boolean stillInGame;

    protected GameParticipant() {
    }

    public GameParticipant(UUID userId, UUID deckId, int startPosition, Integer placement, Boolean winner,
            Boolean stillInGame) {
        if (userId == null || deckId == null) {
            throw new InvalidGameException();
        }
        this.userId = userId;
        this.deckId = deckId;
        this.startPosition = startPosition;
        this.placement = placement;
        this.winner = winner;
        this.stillInGame = stillInGame;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getDeckId() {
        return deckId;
    }

    public int getStartPosition() {
        return startPosition;
    }

    public Integer getPlacement() {
        return placement;
    }

    public Boolean getWinner() {
        return winner;
    }

    public Boolean getStillInGame() {
        return stillInGame;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof GameParticipant p
                && Objects.equals(userId, p.userId) && Objects.equals(deckId, p.deckId)
                && startPosition == p.startPosition && Objects.equals(placement, p.placement)
                && Objects.equals(winner, p.winner) && Objects.equals(stillInGame, p.stillInGame);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, deckId, startPosition, placement, winner, stillInGame);
    }
}
