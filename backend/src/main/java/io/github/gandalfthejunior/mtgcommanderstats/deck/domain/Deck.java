package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.ColorIdentityConverter;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.DisplayText;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;

@Entity
@Table(name = "decks")
public class Deck {
    @Id
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false, columnDefinition = "text")
    private String name;

    @ElementCollection(fetch = FetchType.EAGER)
    @Fetch(FetchMode.SUBSELECT)
    @CollectionTable(name = "deck_commanders", joinColumns = @JoinColumn(name = "deck_id"))
    @OrderBy("position ASC")
    @BatchSize(size = 100)
    private List<DeckCommander> commanders = new ArrayList<>();

    @Convert(converter = ColorIdentityConverter.class)
    @Column(name = "color_identity", nullable = false, columnDefinition = "text")
    private ColorIdentity colorIdentity;

    @Column(name = "ever_used", nullable = false)
    private boolean everUsed;

    @Column(nullable = false)
    private boolean archived;

    protected Deck() {
    }

    public Deck(UUID ownerId, String name, List<DeckCommander> commanders) {
        if (ownerId == null) {
            throw new IllegalArgumentException("Deck owner is required.");
        }
        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
        rename(name);
        replaceCommanders(commanders);
    }

    public void rename(String name) {
        this.name = new DisplayText(name).value();
    }

    public void replaceCommanders(List<DeckCommander> replacement) {
        if (replacement == null || replacement.size() != 1 || replacement.getFirst().getPosition() != 1) {
            throw new InvalidCommanderException();
        }
        boolean same = commanders.size() == replacement.size();
        for (int i = 0; same && i < commanders.size(); i++) {
            same = commanders.get(i).sameGameplay(replacement.get(i));
        }
        if (same) {
            // An idempotent full update must never revert newer presentation snapshots.
            if (!commanders.getFirst().selectionRef().equals(replacement.getFirst().selectionRef())) {
                throw new InvalidCommanderException();
            }
            return;
        }
        if (everUsed) {
            throw new DeckLifecycleConflictException();
        }
        this.commanders.clear();
        this.commanders.addAll(replacement);
        this.colorIdentity = ColorIdentity.fromSymbols(replacement.stream()
                .flatMap(commander -> commander.effectiveColorIdentity().symbols().stream()).distinct().toList());
    }

    public void markUsed() {
        everUsed = true;
    }

    public void archive() {
        archived = true;
    }

    public void requireDeletable() {
        if (everUsed) {
            throw new DeckLifecycleConflictException();
        }
    }

    public boolean isEverUsed() {
        return everUsed;
    }

    public boolean isArchived() {
        return archived;
    }

    public UUID getId() {
        return id;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public String getName() {
        return name;
    }

    public List<DeckCommander> getCommanders() {
        return List.copyOf(commanders);
    }

    public ColorIdentity getColorIdentity() {
        return colorIdentity;
    }
}
