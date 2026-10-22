package io.github.gandalfthejunior.mtgcommanderstats.deck.api;

import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CommanderInput;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CommanderSummary;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.ManageDecks;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.InvalidCommanderException;
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
public class DeckController {
    private final ManageDecks decks;

    public DeckController(ManageDecks decks) {
        this.decks = decks;
    }

    @GetMapping("/api/decks")
    public List<DeckResponse> list(@AuthenticationPrincipal UserPrincipal user) {
        return decks.list(user.getId()).stream().map(DeckResponse::from).toList();
    }

    @PostMapping("/api/decks")
    @ResponseStatus(HttpStatus.CREATED)
    public DeckResponse create(@AuthenticationPrincipal UserPrincipal user, @RequestBody DeckRequest request) {
        return DeckResponse.from(decks.create(user.getId(), request.name(), request.commanders()));
    }

    @PutMapping("/api/decks/{deckId}")
    public DeckResponse update(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID deckId,
            @RequestBody DeckRequest request) {
        return DeckResponse.from(decks.update(user.getId(), deckId, request.name(), request.commanders()));
    }

    @DeleteMapping("/api/decks/{deckId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID deckId) {
        decks.delete(user.getId(), deckId);
    }

    @PostMapping("/api/decks/{deckId}/archive")
    public DeckResponse archive(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID deckId,
            @RequestBody(required = false) ArchiveRequest request) {
        return DeckResponse.from(decks.archive(user.getId(), deckId));
    }

    public record ArchiveRequest() {
        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidArchiveRequestException();
        }
    }

    public static class DeckRequest {
        private String name;
        private List<CommanderInput> commanders;

        public String name() {
            return name;
        }

        public List<CommanderInput> commanders() {
            return commanders;
        }

        @JsonSetter
        public void setName(String name) {
            this.name = name;
        }

        @JsonSetter(nulls = Nulls.FAIL)
        public void setCommanders(List<CommanderInput> commanders) {
            this.commanders = commanders;
        }

        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidCommanderException();
        }
    }

    public record DeckResponse(UUID id, String name, List<CommanderSummary> commanders, List<String> colorIdentity,
            boolean everUsed, boolean archived) {
        static DeckResponse from(Deck deck) {
            return new DeckResponse(deck.getId(), deck.getName(), deck.getCommanders().stream().map(CommanderSummary::from).toList(),
                    deck.getColorIdentity().symbols(), deck.isEverUsed(), deck.isArchived());
        }
    }
}
