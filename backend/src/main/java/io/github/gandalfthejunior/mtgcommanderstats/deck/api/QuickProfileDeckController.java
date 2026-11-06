package io.github.gandalfthejunior.mtgcommanderstats.deck.api;

import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.api.DeckController.ArchiveRequest;
import io.github.gandalfthejunior.mtgcommanderstats.deck.api.DeckController.ArtworkRequest;
import io.github.gandalfthejunior.mtgcommanderstats.deck.api.DeckController.DeckRequest;
import io.github.gandalfthejunior.mtgcommanderstats.deck.api.DeckController.DeckResponse;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.InvalidCommanderException;
import io.github.gandalfthejunior.mtgcommanderstats.quickprofile.application.ManageQuickProfileDecks;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.InvalidCompanionSelectionException;
import io.github.gandalfthejunior.mtgcommanderstats.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Group-scoped deck management for quick profiles, with the request and error contract of /api/decks. */
@RestController
@RequestMapping("/api/groups/{groupId}/quick-profiles/{profileId}/decks")
public class QuickProfileDeckController {
    private final ManageQuickProfileDecks decks;

    public QuickProfileDeckController(ManageQuickProfileDecks decks) {
        this.decks = decks;
    }

    @GetMapping
    public List<DeckResponse> list(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @PathVariable UUID profileId) {
        return decks.list(user.getId(), groupId, profileId).stream().map(DeckResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DeckResponse create(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @PathVariable UUID profileId, @RequestBody DeckRequest request) {
        return DeckResponse.from(decks.create(user.getId(), groupId, profileId, request.name(), request.commanders(),
                request.manaBoxUrl(), request.companion(), request.formatOrDefault()));
    }

    @PutMapping("/{deckId}")
    public DeckResponse update(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @PathVariable UUID profileId, @PathVariable UUID deckId, @RequestBody DeckRequest request) {
        return DeckResponse.from(decks.update(user.getId(), groupId, profileId, deckId, request.name(),
                request.commanders(), request.manaBoxUrlSupplied(), request.manaBoxUrl(), request.companionSupplied(),
                request.companion(), request.format()));
    }

    @PutMapping("/{deckId}/commanders/{position}/artwork")
    public DeckResponse changeArtwork(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @PathVariable UUID profileId, @PathVariable UUID deckId, @PathVariable int position,
            @RequestBody ArtworkRequest request) {
        if (position < 1 || position > 2 || request.scryfallCardId() == null) {
            throw new InvalidCommanderException();
        }
        return DeckResponse.from(decks.changeArtwork(user.getId(), groupId, profileId, deckId, position,
                request.scryfallCardId(), request.artworkFaceIndex()));
    }

    @PutMapping("/{deckId}/companion/artwork")
    public DeckResponse changeCompanionArtwork(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID groupId, @PathVariable UUID profileId, @PathVariable UUID deckId,
            @RequestBody ArtworkRequest request) {
        if (request.scryfallCardId() == null) {
            throw new InvalidCompanionSelectionException("Provide a Companion artwork printing UUID in scryfallCardId.");
        }
        return DeckResponse.from(decks.changeCompanionArtwork(user.getId(), groupId, profileId, deckId,
                request.scryfallCardId(), request.artworkFaceIndex()));
    }

    @DeleteMapping("/{deckId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @PathVariable UUID profileId, @PathVariable UUID deckId) {
        decks.delete(user.getId(), groupId, profileId, deckId);
    }

    @PostMapping("/{deckId}/archive")
    public DeckResponse archive(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @PathVariable UUID profileId, @PathVariable UUID deckId,
            @RequestBody(required = false) ArchiveRequest request) {
        return DeckResponse.from(decks.archive(user.getId(), groupId, profileId, deckId));
    }
}
