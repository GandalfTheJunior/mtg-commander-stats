package io.github.gandalfthejunior.mtgcommanderstats.group.domain;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.DisplayText;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "play_groups")
public class PlayGroup {
    @Id
    private UUID id;

    @Column(nullable = false, columnDefinition = "text")
    private String name;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    protected PlayGroup() {
    }

    public PlayGroup(UUID ownerId, String name) {
        if (ownerId == null) {
            throw new IllegalArgumentException("A group owner is required.");
        }
        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
        this.name = new DisplayText(name).value();
    }

    public void transferOwnership(UUID newOwnerId) {
        if (newOwnerId == null) {
            throw new IllegalArgumentException("A new owner is required.");
        }
        ownerId = newOwnerId;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public UUID getOwnerId() {
        return ownerId;
    }
}
