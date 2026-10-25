package io.github.gandalfthejunior.mtgcommanderstats.game.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CommanderSummary;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.GameDecks.DeckDisplay;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.GameDecks;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.Game;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameParticipant;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import io.github.gandalfthejunior.mtgcommanderstats.game.persistence.GameRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GameGroupAccess;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.UserDirectory.PublicUser;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.UserDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReadGroupStatistics {
    private static final List<String> MANA_COLORS = List.of("W", "U", "B", "R", "G", "C");
    private static final Counts ZERO = new Counts(0, 0);

    private final GameRepository games;
    private final GameGroupAccess groups;
    private final GameDecks decks;
    private final UserDirectory users;

    public ReadGroupStatistics(GameRepository games, GameGroupAccess groups, GameDecks decks, UserDirectory users) {
        this.games = games;
        this.groups = groups;
        this.decks = decks;
        this.users = users;
    }

    // A writable transaction is needed for the existing pessimistic group lock;
    // statistics themselves perform no writes.
    @Transactional
    public GroupStatistics read(UUID actorId, UUID groupId, Integer playerCount) {
        groups.lockActiveMember(groupId, actorId);
        List<Game> history = games.findAllByGroupIdOrderByRecordedAtDescIdDesc(groupId).stream()
                .filter(game -> playerCount == null || game.getParticipants().size() == playerCount).toList();
        Map<Integer, Map<Integer, Counts>> seatCounts = new HashMap<>();
        for (int n = 2; n <= 6; n++) {
            if (playerCount == null || n == playerCount) {
                Map<Integer, Counts> seats = new HashMap<>();
                for (int seat = 1; seat <= n; seat++) {
                    seats.put(seat, ZERO);
                }
                seatCounts.put(n, seats);
            }
        }
        Map<String, Counts> colorCounts = new HashMap<>();
        MANA_COLORS.forEach(color -> colorCounts.put(color, ZERO));
        Map<UUID, Counts> playerCounts = new HashMap<>();
        Map<UUID, Counts> deckCounts = new HashMap<>();
        Map<UUID, UUID> deckOwners = new HashMap<>();
        for (Game game : history) {
            for (GameParticipant participant : game.getParticipants()) {
                boolean won = game.getResult() == GameResult.WIN
                        && participant.getUserId().equals(game.getWinnerUserId());
                Counts appearance = new Counts(1, won ? 1 : 0);
                playerCounts.merge(participant.getUserId(), appearance, Counts::plus);
                deckCounts.merge(participant.getDeckId(), appearance, Counts::plus);
                deckOwners.put(participant.getDeckId(), participant.getUserId());
                seatCounts.get(game.getParticipants().size()).merge(participant.getStartPosition(), appearance, Counts::plus);
            }
        }
        Map<UUID, PublicUser> publicUsers = history.isEmpty() ? Map.of() : users.findAll(playerCounts.keySet());
        Map<UUID, DeckDisplay> publicDecks = history.isEmpty() ? Map.of() : decks.display(deckCounts.keySet());
        for (Map.Entry<UUID, Counts> entry : deckCounts.entrySet()) {
            List<String> colors = publicDecks.get(entry.getKey()).colorIdentity();
            for (String color : colors.isEmpty() ? List.of("C") : colors) {
                colorCounts.merge(color, entry.getValue(), Counts::plus);
            }
        }
        List<PlayerStatistics> players = playerCounts.entrySet().stream().map(entry -> {
            Counts counts = entry.getValue();
            return new PlayerStatistics(entry.getKey(), publicUsers.get(entry.getKey()).username(),
                    counts.games(), counts.wins(), counts.winRatePercent());
        }).sorted(Comparator.comparing(PlayerStatistics::username).thenComparing(PlayerStatistics::userId)).toList();
        List<DeckStatistics> deckRows = deckCounts.entrySet().stream().map(entry -> {
            Counts counts = entry.getValue();
            DeckDisplay deck = publicDecks.get(entry.getKey());
            UUID ownerId = deckOwners.get(entry.getKey());
            return new DeckStatistics(deck.id(), ownerId, publicUsers.get(ownerId).username(), deck.name(),
                    deck.commanders(), deck.archived(), counts.games(), counts.wins(), counts.winRatePercent());
        }).sorted(Comparator.comparing(DeckStatistics::ownerUsername).thenComparing(DeckStatistics::name)
                .thenComparing(DeckStatistics::deckId)).toList();
        List<StartPositionStatistics> startPositions = new ArrayList<>();
        for (int n : seatCounts.keySet().stream().sorted().toList()) {
            List<SeatStatistics> seats = new ArrayList<>();
            for (int seat = 1; seat <= n; seat++) {
                Counts counts = seatCounts.get(n).get(seat);
                seats.add(new SeatStatistics(seat, counts.games(), counts.wins(), counts.winRatePercent()));
            }
            startPositions.add(new StartPositionStatistics(n, seats));
        }
        List<ManaColorStatistics> manaColors = MANA_COLORS.stream().sorted((left, right) -> {
            Counts a = colorCounts.get(left);
            Counts b = colorCounts.get(right);
            if (a.games() == 0 || b.games() == 0) {
                return Long.compare(b.games(), a.games());
            }
            // Cross-products compare exact ratios without rounding or overflowing long.
            int rate = BigDecimal.valueOf(b.wins()).multiply(BigDecimal.valueOf(a.games()))
                    .compareTo(BigDecimal.valueOf(a.wins()).multiply(BigDecimal.valueOf(b.games())));
            return rate != 0 ? rate : Long.compare(b.games(), a.games());
        }).map(color -> {
            Counts counts = colorCounts.get(color);
            return new ManaColorStatistics(color, counts.games(), counts.wins(), counts.winRatePercent());
        }).toList(); // Stable stream sort retains W,U,B,R,G,C for equal rates and counts.
        return new GroupStatistics(players, deckRows, startPositions, manaColors);
    }

    private record Counts(long games, long wins) {
        Counts plus(Counts other) {
            return new Counts(games + other.games, wins + other.wins);
        }

        BigDecimal winRatePercent() {
            if (games == 0) {
                return null;
            }
            return BigDecimal.valueOf(wins).multiply(BigDecimal.valueOf(100))
                    .divide(BigDecimal.valueOf(games), 2, RoundingMode.HALF_UP);
        }
    }

    public record GroupStatistics(List<PlayerStatistics> players, List<DeckStatistics> decks,
            List<StartPositionStatistics> startPositions, List<ManaColorStatistics> manaColors) {
    }

    public record StartPositionStatistics(int playerCount, List<SeatStatistics> seats) {
    }

    public record SeatStatistics(int startPosition, long games, long wins, BigDecimal winRatePercent) {
    }

    public record ManaColorStatistics(String color, long games, long wins, BigDecimal winRatePercent) {
    }

    public record PlayerStatistics(UUID userId, String username, long games, long wins, BigDecimal winRatePercent) {
    }

    public record DeckStatistics(UUID deckId, UUID ownerUserId, String ownerUsername, String name, List<CommanderSummary> commanders,
            boolean archived, long games, long wins, BigDecimal winRatePercent) {
    }
}
