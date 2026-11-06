package io.github.gandalfthejunior.mtgcommanderstats.game.domain;

import java.time.Instant;
import java.time.LocalDate;
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

    @Column(name = "played_on")
    private LocalDate playedOn;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "text")
    private GameResult result;

    @Column(name = "alternate_win_con", nullable = false)
    private boolean alternateWinCon;

    @ElementCollection
    @CollectionTable(name = "game_participants", joinColumns = @JoinColumn(name = "game_id"))
    private List<GameParticipant> participants = new ArrayList<>();

    protected Game() {
    }

    public Game(UUID groupId, UUID creatorId, List<GameParticipant> participants, GameResult result,
            Boolean alternateWinCon) {
        this(groupId, creatorId, participants, result, alternateWinCon, null);
    }

    public Game(UUID groupId, UUID creatorId, List<GameParticipant> participants, GameResult result,
            Boolean alternateWinCon, LocalDate playedOn) {
        this.id = UUID.randomUUID();
        this.groupId = groupId;
        this.creatorId = creatorId;
        this.recordedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        replace(participants, result, alternateWinCon, playedOn);
    }

    public static void validate(List<GameParticipant> participants, GameResult result, Boolean alternateWinCon) {
        if (participants == null || participants.size() < 2 || participants.size() > 6 || result == null) {
            throw new InvalidGameException();
        }
        if (alternateWinCon == null || (result == GameResult.DRAW && alternateWinCon)) {
            throw new InvalidGameException();
        }
        Set<UUID> users = new HashSet<>();
        Set<UUID> decks = new HashSet<>();
        Set<Integer> seats = new HashSet<>();
        List<Integer> ranks = new ArrayList<>();
        int winners = 0;
        int survivors = 0;
        for (GameParticipant p : participants) {
            if (p == null || p.getUserId() == null || p.getDeckId() == null
                    || !users.add(p.getUserId()) || !decks.add(p.getDeckId())
                    || p.getStartPosition() < 1 || p.getStartPosition() > participants.size()
                    || !seats.add(p.getStartPosition())) {
                throw new InvalidGameException();
            }
            Integer place = p.getPlacement();
            if (result == GameResult.DRAW) {
                if (place != null || p.getWinner() != null || p.getStillInGame() == null) {
                    throw new InvalidGameException();
                }
                if (p.getStillInGame()) {
                    survivors++;
                }
            } else if (!alternateWinCon) {
                if (p.getWinner() != null || p.getStillInGame() != null) {
                    throw new InvalidGameException();
                }
                if (place != null) {
                    ranks.add(place);
                }
                if (Integer.valueOf(1).equals(place)) {
                    winners++;
                }
            } else if (Boolean.TRUE.equals(p.getWinner())) {
                if (place != null || p.getStillInGame() != null) {
                    throw new InvalidGameException();
                }
                winners++;
                ranks.add(1);
            } else {
                if (p.getWinner() != null || p.getStillInGame() == null) {
                    throw new InvalidGameException();
                }
                if (p.getStillInGame()) {
                    if (place != null) {
                        throw new InvalidGameException();
                    }
                    survivors++;
                    ranks.add(2);
                } else {
                    if (place != null && place <= 2) {
                        throw new InvalidGameException();
                    }
                    if (place != null) {
                        ranks.add(place);
                    }
                }
            }
        }
        if (result == GameResult.DRAW) {
            if (survivors == 0) {
                throw new InvalidGameException();
            }
        } else {
            if (winners != 1 || (alternateWinCon && survivors == 0)) {
                throw new InvalidGameException();
            }
            validatePartialRanks(ranks, participants.size());
        }
    }

    private static void validatePartialRanks(List<Integer> ranks, int playerCount) {
        ranks.sort(Integer::compareTo);
        int unknown = playerCount - ranks.size();
        int nextRank = 1;
        for (int i = 0; i < ranks.size();) {
            int rank = ranks.get(i);
            // Each gap needs this many unknown players before the next known tie group.
            // Overlapping groups cannot be repaired by adding unknown results.
            int gap = rank - nextRank;
            if (rank < 1 || rank > playerCount || gap < 0 || gap > unknown) {
                throw new InvalidGameException();
            }
            unknown -= gap;
            int count = 0;
            while (i < ranks.size() && ranks.get(i) == rank) {
                count++;
                i++;
            }
            nextRank = rank + count;
        }
    }

    public void replace(List<GameParticipant> participants, GameResult result, Boolean alternateWinCon) {
        replace(participants, result, alternateWinCon, playedOn);
    }

    public void replace(List<GameParticipant> participants, GameResult result, Boolean alternateWinCon,
            LocalDate playedOn) {
        validate(participants, result, alternateWinCon);
        this.participants.clear();
        this.participants.addAll(participants);
        this.result = result;
        this.alternateWinCon = alternateWinCon;
        this.playedOn = playedOn;
    }

    public boolean isAlternateWinCon() {
        return alternateWinCon;
    }

    public Integer placement(GameParticipant p) {
        if (result == GameResult.DRAW) {
            return null;
        }
        if (!alternateWinCon) {
            return p.getPlacement();
        }
        if (Boolean.TRUE.equals(p.getWinner())) {
            return 1;
        }
        if (Boolean.TRUE.equals(p.getStillInGame())) {
            return 2;
        }
        return p.getPlacement();
    }

    public boolean stillInGame(GameParticipant p) {
        if (result == GameResult.WIN && !alternateWinCon) {
            return Integer.valueOf(1).equals(p.getPlacement());
        }
        return Boolean.TRUE.equals(p.getWinner()) || Boolean.TRUE.equals(p.getStillInGame());
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

    public LocalDate getPlayedOn() {
        return playedOn;
    }

    public GameResult getResult() {
        return result;
    }

    public UUID getWinnerUserId() {
        validate(participants, result, alternateWinCon);
        if (result == GameResult.DRAW) {
            return null;
        }
        return participants.stream().filter(p -> Integer.valueOf(1).equals(placement(p)))
                .findFirst().orElseThrow(InvalidGameException::new).getUserId();
    }

    public List<GameParticipant> getParticipants() {
        return List.copyOf(participants);
    }
}
