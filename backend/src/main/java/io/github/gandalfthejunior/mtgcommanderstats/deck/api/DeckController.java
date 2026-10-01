package io.github.gandalfthejunior.mtgcommanderstats.deck.api;

import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.ManageDecks;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
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
        return DeckResponse.from(decks.create(user.getId(), request.name(), request.commander(),
                request.colorIdentity()));
    }

    @PutMapping("/api/decks/{deckId}")
    public DeckResponse update(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID deckId,
            @RequestBody DeckRequest request) {
        return DeckResponse.from(decks.update(user.getId(), deckId, request.name(), request.commander(),
                request.colorIdentity()));
    }

    @DeleteMapping("/api/decks/{deckId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID deckId) {
        decks.delete(user.getId(), deckId);
    }

    public record DeckRequest(String name, String commander, List<String> colorIdentity) {
    }

    public record DeckResponse(UUID id, String name, String commander, List<String> colorIdentity) {
        static DeckResponse from(Deck deck) {
            return new DeckResponse(deck.getId(), deck.getName(), deck.getCommander(),
                    deck.getColorIdentity().symbols());
        }
    }
}
