package io.github.gandalfthejunior.mtgcommanderstats.game.application;

import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.GameDecks;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.GameDecks.DeckDisplay;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.Game;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameParticipant;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.InvalidGameException;
import io.github.gandalfthejunior.mtgcommanderstats.game.persistence.GameRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GameGroupAccess;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupAccessDeniedException;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.UserDirectory;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.UserDirectory.PublicUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ManageGames {
    private final GameRepository games;
    private final GameGroupAccess groups;
    private final GameDecks decks;
    private final UserDirectory users;

    public ManageGames(GameRepository games, GameGroupAccess groups, GameDecks decks, UserDirectory users) {
        this.games = games;
        this.groups = groups;
        this.decks = decks;
        this.users = users;
    }

    public GameDetails create(UUID actorId, UUID groupId, List<GameParticipant> participants, GameResult result,
            UUID winnerUserId) {
        groups.lockActiveMember(groupId, actorId);
        Game game = new Game(groupId, actorId, participants, result, winnerUserId);
        useNewAssignments(groupId, participants, List.of());
        games.save(game);
        return details(game);
    }

    public List<GameDetails> list(UUID actorId, UUID groupId) {
        groups.lockActiveMember(groupId, actorId);
        return games.findAllByGroupIdOrderByRecordedAtDescIdDesc(groupId).stream().map(this::details).toList();
    }

    public GameDetails get(UUID actorId, UUID groupId, UUID gameId) {
        groups.lockActiveMember(groupId, actorId);
        return details(find(groupId, gameId));
    }

    public GameDetails replace(UUID actorId, UUID groupId, UUID gameId, List<GameParticipant> participants,
            GameResult result, UUID winnerUserId) {
        GroupRole role = groups.lockActiveMember(groupId, actorId);
        Game game = find(groupId, gameId);
        requireModification(actorId, role, game);
        Game.validate(participants, result, winnerUserId);
        useNewAssignments(groupId, participants, game.getParticipants());
        game.replace(participants, result, winnerUserId);
        return details(game);
    }

    public void delete(UUID actorId, UUID groupId, UUID gameId) {
        GroupRole role = groups.lockActiveMember(groupId, actorId);
        Game game = find(groupId, gameId);
        requireModification(actorId, role, game);
        games.delete(game);
    }

    public List<DeckSelectionSummary> eligibleDecks(UUID actorId, UUID groupId, UUID targetUserId) {
        groups.lockActiveMember(groupId, actorId);
        if (!groups.isActiveMember(groupId, targetUserId)) {
            throw new GameNotFoundException();
        }
        return decks.eligible(targetUserId).stream()
                .map(deck -> new DeckSelectionSummary(deck.id(), deck.name(), deck.commander(), deck.colorIdentity()))
                .toList();
    }

    private void useNewAssignments(UUID groupId, List<GameParticipant> participants,
            List<GameParticipant> previous) {
        Map<UUID, UUID> deckOwners = new HashMap<>();
        for (GameParticipant participant : participants) {
            if (!previous.contains(participant)) {
                if (!groups.isActiveMember(groupId, participant.getUserId())
                        || deckOwners.putIfAbsent(participant.getDeckId(), participant.getUserId()) != null) {
                    throw new InvalidGameException();
                }
            }
        }
        decks.use(deckOwners);
    }

    private Game find(UUID groupId, UUID gameId) {
        return games.findByIdAndGroupId(gameId, groupId).orElseThrow(GameNotFoundException::new);
    }

    private void requireModification(UUID actorId, GroupRole role, Game game) {
        if (role != GroupRole.OWNER && !game.getCreatorId().equals(actorId)) {
            throw new GroupAccessDeniedException();
        }
    }

    private GameDetails details(Game game) {
        List<GameParticipant> participants = game.getParticipants();
        Map<UUID, PublicUser> publicUsers = users.findAll(participants.stream()
                .map(GameParticipant::getUserId).toList());
        Map<UUID, DeckDisplay> publicDecks = decks.display(participants.stream()
                .map(GameParticipant::getDeckId).toList());
        List<ParticipantDetails> summaries = participants.stream()
                .sorted(Comparator.comparing(GameParticipant::getUserId))
                .map(participant -> new ParticipantDetails(participant.getUserId(),
                        publicUsers.get(participant.getUserId()).username(), participant.getDeckId(),
                        publicDecks.get(participant.getDeckId())))
                .toList();
        return new GameDetails(game.getId(), game.getGroupId(), game.getCreatorId(), game.getRecordedAt(),
                game.getResult(), game.getWinnerUserId(), summaries);
    }

    public record GameDetails(UUID id, UUID groupId, UUID creatorId, Instant recordedAt, GameResult result,
            UUID winnerUserId, List<ParticipantDetails> participants) {
    }

    public record ParticipantDetails(UUID userId, String username, UUID deckId, DeckDisplay deck) {
    }

    public record DeckSelectionSummary(UUID id, String name, String commander, List<String> colorIdentity) {
    }
}
