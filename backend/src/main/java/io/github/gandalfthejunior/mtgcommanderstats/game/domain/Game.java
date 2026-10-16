package io.github.gandalfthejunior.mtgcommanderstats.game.domain;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

@Entity
@Table(name = "games")
public class Game {
    @Id
    private UUID id;

    @Column(name = "group_id", nullable = false, updatable = false)
    private UUID groupId;

    @Column(name = "creator_id", nullable = false, updatable = false)
    private UUID creatorId;

    @Column(name = "recorded_at", nullable = false, updatable = false)
    private Instant recordedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "text")
    private GameResult result;

    @Column(name = "winner_user_id")
    private UUID winnerUserId;

    @ElementCollection
    @CollectionTable(name = "game_participants", joinColumns = @JoinColumn(name = "game_id"))
    private List<GameParticipant> participants = new ArrayList<>();

    protected Game() {
    }

    public Game(UUID groupId, UUID creatorId, List<GameParticipant> participants, GameResult result,
            UUID winnerUserId) {
        this.id = UUID.randomUUID();
        this.groupId = groupId;
        this.creatorId = creatorId;
        this.recordedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        replace(participants, result, winnerUserId);
    }

    public static void validate(List<GameParticipant> participants, GameResult result, UUID winnerUserId) {
        if (participants == null || participants.size() < 2 || participants.size() > 6 || result == null) {
            throw new InvalidGameException();
        }
        Set<UUID> users = new HashSet<>();
        for (GameParticipant participant : participants) {
            if (participant == null || !users.add(participant.getUserId())) {
                throw new InvalidGameException();
            }
        }
        if ((result == GameResult.WIN && (winnerUserId == null || !users.contains(winnerUserId)))
                || (result == GameResult.DRAW && winnerUserId != null)) {
            throw new InvalidGameException();
        }
    }

    public void replace(List<GameParticipant> participants, GameResult result, UUID winnerUserId) {
        validate(participants, result, winnerUserId);
        this.participants.clear();
        this.participants.addAll(participants);
        this.result = result;
        this.winnerUserId = winnerUserId;
    }

    public UUID getId() {
        return id;
    }

    public UUID getGroupId() {
        return groupId;
    }

    public UUID getCreatorId() {
        return creatorId;
    }

    public Instant getRecordedAt() {
        return recordedAt;
    }

    public GameResult getResult() {
        return result;
    }

    public UUID getWinnerUserId() {
        return winnerUserId;
    }

    public List<GameParticipant> getParticipants() {
        return List.copyOf(participants);
    }
}
