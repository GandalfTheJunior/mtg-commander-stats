package io.github.gandalfthejunior.mtgcommanderstats.group.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "ownership_transfers")
public class OwnershipTransfer {
    public enum State { PENDING, ACCEPTED, DECLINED, CANCELLED }

    @Id
    private UUID id;
    @Column(name = "group_id", nullable = false)
    private UUID groupId;
    @Column(name = "requester_id", nullable = false)
    private UUID requesterId;
    @Column(name = "target_id", nullable = false)
    private UUID targetId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "text")
    private State state;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "resolved_at")
    private Instant resolvedAt;
    @Column(name = "acknowledged_at")
    private Instant acknowledgedAt;

    protected OwnershipTransfer() {
    }

    public OwnershipTransfer(UUID groupId, UUID requesterId, UUID targetId) {
        this.id = UUID.randomUUID();
        this.groupId = groupId;
        this.requesterId = requesterId;
        this.targetId = targetId;
        this.state = State.PENDING;
        this.createdAt = Instant.now();
    }

    public void resolve(State outcome) {
        if (state != State.PENDING || outcome == State.PENDING) {
            throw new IllegalStateException("Only pending transfers can be resolved.");
        }
        state = outcome;
        resolvedAt = Instant.now();
    }

    public void acknowledge() {
        if ((state != State.ACCEPTED && state != State.DECLINED) || acknowledgedAt != null) {
            throw new IllegalStateException("Only unacknowledged outcomes can be acknowledged.");
        }
        acknowledgedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getGroupId() { return groupId; }
    public UUID getRequesterId() { return requesterId; }
    public UUID getTargetId() { return targetId; }
    public State getState() { return state; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getResolvedAt() { return resolvedAt; }
    public Instant getAcknowledgedAt() { return acknowledgedAt; }
}
