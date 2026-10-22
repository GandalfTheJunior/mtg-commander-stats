package io.github.gandalfthejunior.mtgcommanderstats.game.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
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
    public GroupStatistics read(UUID actorId, UUID groupId) {
        groups.lockActiveMember(groupId, actorId);
        List<Game> history = games.findAllByGroupIdOrderByRecordedAtDescIdDesc(groupId);
        if (history.isEmpty()) {
            return new GroupStatistics(List.of(), List.of());
        }
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
            }
        }
        Map<UUID, PublicUser> publicUsers = users.findAll(playerCounts.keySet());
        Map<UUID, DeckDisplay> publicDecks = decks.display(deckCounts.keySet());
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
        return new GroupStatistics(players, deckRows);
    }

    private record Counts(long games, long wins) {
        Counts plus(Counts other) {
            return new Counts(games + other.games, wins + other.wins);
        }

        BigDecimal winRatePercent() {
            return BigDecimal.valueOf(wins).multiply(BigDecimal.valueOf(100))
                    .divide(BigDecimal.valueOf(games), 2, RoundingMode.HALF_UP);
        }
    }

    public record GroupStatistics(List<PlayerStatistics> players, List<DeckStatistics> decks) {
    }

    public record PlayerStatistics(UUID userId, String username, long games, long wins, BigDecimal winRatePercent) {
    }

    public record DeckStatistics(UUID deckId, UUID ownerUserId, String ownerUsername, String name, List<CommanderSummary> commanders,
            boolean archived, long games, long wins, BigDecimal winRatePercent) {
    }
}
