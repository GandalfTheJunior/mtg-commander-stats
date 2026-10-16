package io.github.gandalfthejunior.mtgcommanderstats.game.api;

import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import io.github.gandalfthejunior.mtgcommanderstats.game.application.ManageGames;
import io.github.gandalfthejunior.mtgcommanderstats.game.application.ManageGames.DeckSelectionSummary;
import io.github.gandalfthejunior.mtgcommanderstats.game.application.ManageGames.GameDetails;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameParticipant;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.GameResult;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.InvalidGameException;
import io.github.gandalfthejunior.mtgcommanderstats.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class GameController {
    private final ManageGames games;

    public GameController(ManageGames games) {
        this.games = games;
    }

    @PostMapping("/api/groups/{groupId}/games")
    @ResponseStatus(HttpStatus.CREATED)
    public GameDetails create(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @RequestBody GameRequest request) {
        return games.create(user.getId(), groupId, request.assignments(), GameResult.parse(request.result()),
                uuid(request.winnerUserId()));
    }

    @GetMapping("/api/groups/{groupId}/games")
    public List<GameDetails> list(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId) {
        return games.list(user.getId(), groupId);
    }

    @GetMapping("/api/groups/{groupId}/games/{gameId}")
    public GameDetails get(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @PathVariable UUID gameId) {
        return games.get(user.getId(), groupId, gameId);
    }

    @PutMapping("/api/groups/{groupId}/games/{gameId}")
    public GameDetails replace(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @PathVariable UUID gameId, @RequestBody GameRequest request) {
        return games.replace(user.getId(), groupId, gameId, request.assignments(), GameResult.parse(request.result()),
                uuid(request.winnerUserId()));
    }

    @DeleteMapping("/api/groups/{groupId}/games/{gameId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @PathVariable UUID gameId) {
        games.delete(user.getId(), groupId, gameId);
    }

    @GetMapping("/api/groups/{groupId}/members/{userId}/decks")
    public List<DeckSelectionSummary> eligibleDecks(@AuthenticationPrincipal UserPrincipal actor,
            @PathVariable UUID groupId, @PathVariable UUID userId) {
        return games.eligibleDecks(actor.getId(), groupId, userId);
    }

    private static UUID uuid(String value) {
        if (value == null) {
            return null;
        }
        try {
            UUID id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value)) {
                throw new InvalidGameException();
            }
            return id;
        } catch (IllegalArgumentException exception) {
            throw new InvalidGameException();
        }
    }

    public record GameRequest(List<ParticipantRequest> participants, String result, String winnerUserId) {
        List<GameParticipant> assignments() {
            if (participants == null || participants.stream().anyMatch(participant -> participant == null)) {
                throw new InvalidGameException();
            }
            return participants.stream()
                    .map(participant -> new GameParticipant(uuid(participant.userId()), uuid(participant.deckId()))).toList();
        }

        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidGameException();
        }
    }

    public record ParticipantRequest(String userId, String deckId) {
        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidGameException();
        }
    }
}
