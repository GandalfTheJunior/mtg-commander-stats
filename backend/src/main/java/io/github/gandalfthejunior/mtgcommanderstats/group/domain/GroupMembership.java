package io.github.gandalfthejunior.mtgcommanderstats.group.domain;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "group_memberships")
public class GroupMembership {
    @Id
    private UUID id;

    @Column(name = "group_id", nullable = false)
    private UUID groupId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "text")
    private GroupRole role;

    @Column(nullable = false)
    private boolean active;

    protected GroupMembership() {
    }

    private GroupMembership(UUID groupId, UUID userId, GroupRole role) {
        if (groupId == null || userId == null || role == null) {
            throw new IllegalArgumentException("A group, user, and role are required.");
        }
        this.id = UUID.randomUUID();
        this.groupId = groupId;
        this.userId = userId;
        this.role = role;
        this.active = true;
    }

    public static GroupMembership owner(UUID groupId, UUID userId) {
        return new GroupMembership(groupId, userId, GroupRole.OWNER);
    }

    public static GroupMembership member(UUID groupId, UUID userId) {
        return new GroupMembership(groupId, userId, GroupRole.MEMBER);
    }

    public void reactivateAsMember() {
        if (role != GroupRole.OWNER) {
            role = GroupRole.MEMBER;
        }
        active = true;
    }

    public void leave() {
        if (role == GroupRole.OWNER) {
            throw new OwnerCannotLeaveException();
        }
        active = false;
    }

    public UUID getId() {
        return id;
    }

    public UUID getGroupId() {
        return groupId;
    }

    public UUID getUserId() {
        return userId;
    }

    public GroupRole getRole() {
        return role;
    }

    public boolean isActive() {
        return active;
    }
}
