package io.github.gandalfthejunior.mtgcommanderstats.scryfall.api;

import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.InvalidScryfallRequestException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.ScryfallLookup;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.Artwork;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardDetails;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderChoice;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ScryfallController {
    private final ScryfallLookup scryfall;

    public ScryfallController(ScryfallLookup scryfall) {
        this.scryfall = scryfall;
    }

    @GetMapping("/api/scryfall/commanders")
    public List<CommanderChoice> commanders(@RequestParam(required = false) String q,
            @RequestParam(required = false) String partnerOf,
            @RequestParam(required = false) Integer partnerGameplayFaceIndex) {
        if (partnerOf != null) {
            return scryfall.searchPartners(q, new CommanderSelectionRef(printingId(partnerOf), partnerGameplayFaceIndex));
        }
        if (partnerGameplayFaceIndex != null) {
            throw new InvalidScryfallRequestException();
        }
        return scryfall.searchCommanders(q);
    }

    @GetMapping("/api/scryfall/cards/{scryfallCardId}")
    public CardDetails card(@PathVariable String scryfallCardId) {
        return scryfall.cardDetails(printingId(scryfallCardId));
    }

    @GetMapping("/api/scryfall/cards/{scryfallCardId}/artworks")
    public List<Artwork> artworks(@PathVariable String scryfallCardId,
            @RequestParam(required = false) Integer gameplayFaceIndex) {
        return scryfall.artworks(printingId(scryfallCardId), gameplayFaceIndex);
    }

    private static UUID printingId(String value) {
        try {
            UUID id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value)) {
                throw new IllegalArgumentException();
            }
            return id;
        } catch (IllegalArgumentException exception) {
            throw new InvalidScryfallRequestException();
        }
    }
}
