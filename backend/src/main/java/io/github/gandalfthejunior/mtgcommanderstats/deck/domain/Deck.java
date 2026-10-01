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
        this.name = new DisplayText(name).value();
        this.commander = new DisplayText(commander).value();
        this.colorIdentity = colorIdentity;
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
