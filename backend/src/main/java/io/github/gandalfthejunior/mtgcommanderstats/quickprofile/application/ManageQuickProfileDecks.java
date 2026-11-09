package io.github.gandalfthejunior.mtgcommanderstats.quickprofile.application;

import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CommanderInput;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.CompanionInput;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.ManageDecks;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckFormat;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.QuickProfileAccess;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Delegated deck management for quick profiles: any active member of the profile's group may act.
 * The group row is locked first; {@link ManageDecks} then applies the unchanged deck rules and locks.
 */
@Service
@Transactional
public class ManageQuickProfileDecks {
    private final QuickProfileAccess access;
    private final ManageDecks decks;

    public ManageQuickProfileDecks(QuickProfileAccess access, ManageDecks decks) {
        this.access = access;
        this.decks = decks;
    }

    public List<Deck> list(UUID actorId, UUID groupId, UUID profileId) {
        return decks.list(authorize(actorId, groupId, profileId));
    }

    public Deck create(UUID actorId, UUID groupId, UUID profileId, String name, List<CommanderInput> commanders,
            String manaBoxUrl, CompanionInput companion, DeckFormat format) {
        return decks.create(authorize(actorId, groupId, profileId), name, commanders, manaBoxUrl, companion, format);
    }

    public ManageDecks.CreateResult createIdempotent(UUID actorId, UUID groupId, UUID profileId, UUID key,
            String name, List<CommanderInput> commanders, String manaBoxUrl, CompanionInput companion, DeckFormat format) {
        return decks.createIdempotent(authorize(actorId, groupId, profileId), key, name, commanders, manaBoxUrl,
                companion, format);
    }

    public Deck update(UUID actorId, UUID groupId, UUID profileId, UUID deckId, String name,
            List<CommanderInput> commanders, boolean manaBoxUrlSupplied, String manaBoxUrl,
            boolean companionSupplied, CompanionInput companion, DeckFormat format) {
        return decks.update(authorize(actorId, groupId, profileId), deckId, name, commanders, manaBoxUrlSupplied,
                manaBoxUrl, companionSupplied, companion, format);
    }

    public Deck changeArtwork(UUID actorId, UUID groupId, UUID profileId, UUID deckId, int position,
            UUID printingId, Integer artworkFaceIndex) {
        return decks.changeArtwork(authorize(actorId, groupId, profileId), deckId, position, printingId,
                artworkFaceIndex);
    }

    public Deck changeCompanionArtwork(UUID actorId, UUID groupId, UUID profileId, UUID deckId, UUID printingId,
            Integer artworkFaceIndex) {
        return decks.changeCompanionArtwork(authorize(actorId, groupId, profileId), deckId, printingId,
                artworkFaceIndex);
    }

    public void delete(UUID actorId, UUID groupId, UUID profileId, UUID deckId) {
        decks.delete(authorize(actorId, groupId, profileId), deckId);
    }

    public Deck archive(UUID actorId, UUID groupId, UUID profileId, UUID deckId) {
        return decks.archive(authorize(actorId, groupId, profileId), deckId);
    }

    private UUID authorize(UUID actorId, UUID groupId, UUID profileId) {
        access.lockActiveMember(groupId, actorId);
        return access.activeProfile(groupId, profileId).getId();
    }
}
