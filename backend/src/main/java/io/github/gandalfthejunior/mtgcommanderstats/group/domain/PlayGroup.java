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

    @Column(name = "join_code", nullable = false, length = 22)
    private String joinCode;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    protected PlayGroup() {
    }

    public PlayGroup(UUID ownerId, String name, String joinCode) {
        if (ownerId == null || joinCode == null) {
            throw new IllegalArgumentException("A group owner and join code are required.");
        }
        this.id = UUID.randomUUID();
        this.ownerId = ownerId;
        this.name = new DisplayText(name).value();
        this.joinCode = joinCode;
    }

    public void regenerateJoinCode(String joinCode) {
        if (joinCode == null) {
            throw new IllegalArgumentException("A join code is required.");
        }
        this.joinCode = joinCode;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getJoinCode() {
        return joinCode;
    }

    public UUID getOwnerId() {
        return ownerId;
    }
}
