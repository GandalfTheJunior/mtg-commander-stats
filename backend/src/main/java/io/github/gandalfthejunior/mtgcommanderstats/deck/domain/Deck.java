package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.persistence.ColorIdentityConverter;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.DisplayText;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "decks")
public class Deck {
    @Id
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false, columnDefinition = "text")
    private String name;

    @Column(nullable = false, columnDefinition = "text")
    private String commander;

    @Convert(converter = ColorIdentityConverter.class)
    @Column(name = "color_identity", nullable = false, columnDefinition = "text")
    private ColorIdentity colorIdentity;

    @Column(name = "ever_used", nullable = false)
    private boolean everUsed;

    @Column(nullable = false)
    private boolean archived;

    protected Deck() {
    }

    public Deck(UUID ownerId, String name, String commander, ColorIdentity colorIdentity) {
        if (ownerId == null || colorIdentity == null) {
            throw new IllegalArgumentException("Deck owner and color identity are required.");
        }
        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
        update(name, commander, colorIdentity);
    }

    public void update(String name, String commander, ColorIdentity colorIdentity) {
        if (colorIdentity == null) {
            throw new InvalidColorIdentityException();
        }
        String canonicalName = new DisplayText(name).value();
        String canonicalCommander = new DisplayText(commander).value();
        if (everUsed && (!this.commander.equals(canonicalCommander)
                || !this.colorIdentity.canonicalValue().equals(colorIdentity.canonicalValue()))) {
            throw new DeckLifecycleConflictException();
        }
        this.name = canonicalName;
        this.commander = canonicalCommander;
        this.colorIdentity = colorIdentity;
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

    public String getCommander() {
        return commander;
    }

    public ColorIdentity getColorIdentity() {
        return colorIdentity;
    }
}
