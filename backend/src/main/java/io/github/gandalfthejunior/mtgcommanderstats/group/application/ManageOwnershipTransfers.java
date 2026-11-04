package io.github.gandalfthejunior.mtgcommanderstats.group.application;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupMembership;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.OwnershipTransfer;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.OwnershipTransfer.State;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.PlayGroup;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.GroupMembershipRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.OwnershipTransferRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.PlayGroupRepository;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.UserDirectory;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.UserDirectory.PublicUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ManageOwnershipTransfers {
    private final PlayGroupRepository groups;
    private final GroupMembershipRepository memberships;
    private final OwnershipTransferRepository transfers;
    private final UserDirectory users;

    public ManageOwnershipTransfers(PlayGroupRepository groups, GroupMembershipRepository memberships,
            OwnershipTransferRepository transfers, UserDirectory users) {
        this.groups = groups;
        this.memberships = memberships;
        this.transfers = transfers;
        this.users = users;
    }

    public TransferStatus create(UUID actorId, UUID groupId, UUID targetId) {
        PlayGroup group = lockGroup(groupId);
        requireOwner(group, actorId);
        GroupMembership target = memberships.findByGroupIdAndUserId(groupId, targetId)
                .filter(GroupMembership::isActive).orElseThrow(GroupMemberNotFoundException::new);
        if (target.getRole() != GroupRole.ADMIN) {
            throw new GroupAccessDeniedException();
        }
        if (transfers.findByGroupIdAndState(groupId, State.PENDING).isPresent()) {
            throw new OwnershipTransferConflictException();
        }
        return status(transfers.save(new OwnershipTransfer(groupId, actorId, targetId)));
    }

    public TransferStatus pending(UUID actorId, UUID groupId) {
        PlayGroup group = lockGroup(groupId);
        GroupMembership actor = activeMember(groupId, actorId);
        if (actor.getRole() != GroupRole.OWNER && actor.getRole() != GroupRole.ADMIN) {
            throw new GroupAccessDeniedException();
        }
        OwnershipTransfer transfer = transfers.findByGroupIdAndState(groupId, State.PENDING)
                .filter(value -> group.getOwnerId().equals(actorId) || value.getTargetId().equals(actorId))
                .orElseThrow(GroupMemberNotFoundException::new);
        return status(transfer);
    }

    public TransferStatus respond(UUID actorId, UUID groupId, UUID requestId, boolean accept) {
        PlayGroup group = lockGroup(groupId);
        OwnershipTransfer transfer = transfers.findByIdAndGroupId(requestId, groupId)
                .filter(value -> value.getTargetId().equals(actorId))
                .orElseThrow(GroupMemberNotFoundException::new);
        requirePending(transfer);
        GroupMembership target = memberships.findByGroupIdAndUserId(groupId, actorId)
                .filter(member -> member.isActive() && member.getRole() == GroupRole.ADMIN)
                .orElseThrow(OwnershipTransferConflictException::new);
        if (!group.getOwnerId().equals(transfer.getRequesterId())) {
            throw new OwnershipTransferConflictException();
        }
        GroupMembership owner = activeMember(groupId, transfer.getRequesterId());
        if (owner.getRole() != GroupRole.OWNER) {
            throw new OwnershipTransferConflictException();
        }
        if (accept) {
            // Release the immediate unique OWNER slot before promoting the target.
            // Deferred constraints validate the complete transaction at commit.
            owner.relinquishOwnership();
            memberships.flush();
            target.acceptOwnership();
            group.transferOwnership(actorId);
        }
        transfer.resolve(accept ? State.ACCEPTED : State.DECLINED);
        return status(transfer);
    }

    public void withdraw(UUID actorId, UUID groupId, UUID requestId) {
        PlayGroup group = lockGroup(groupId);
        OwnershipTransfer transfer = transfers.findByIdAndGroupId(requestId, groupId)
                .filter(value -> value.getRequesterId().equals(actorId))
                .orElseThrow(GroupMemberNotFoundException::new);
        requirePending(transfer);
        requireOwner(group, actorId);
        transfer.resolve(State.CANCELLED);
    }

    public List<TransferStatus> notices(UUID actorId, UUID groupId) {
        lockGroup(groupId);
        activeMember(groupId, actorId);
        return transfers.findTop20ByGroupIdAndRequesterIdAndStateInAndAcknowledgedAtIsNullOrderByCreatedAtAscIdAsc(
                groupId, actorId, List.of(State.ACCEPTED, State.DECLINED)).stream().map(this::status).toList();
    }

    public void acknowledge(UUID actorId, UUID groupId, UUID noticeId) {
        lockGroup(groupId);
        activeMember(groupId, actorId);
        OwnershipTransfer transfer = request(groupId, noticeId);
        if (!transfer.getRequesterId().equals(actorId)
                || (transfer.getState() != State.ACCEPTED && transfer.getState() != State.DECLINED)) {
            throw new GroupMemberNotFoundException();
        }
        if (transfer.getAcknowledgedAt() != null) {
            throw new OwnershipTransferConflictException();
        }
        transfer.acknowledge();
    }

    private PlayGroup lockGroup(UUID groupId) {
        return groups.findByIdForUpdate(groupId).orElseThrow(GroupNotFoundException::new);
    }

    private GroupMembership activeMember(UUID groupId, UUID actorId) {
        return memberships.findByGroupIdAndUserId(groupId, actorId).filter(GroupMembership::isActive)
                .orElseThrow(GroupAccessDeniedException::new);
    }

    private void requireOwner(PlayGroup group, UUID actorId) {
        if (!group.getOwnerId().equals(actorId)
                || activeMember(group.getId(), actorId).getRole() != GroupRole.OWNER) {
            throw new GroupAccessDeniedException();
        }
    }

    private OwnershipTransfer request(UUID groupId, UUID requestId) {
        return transfers.findByIdAndGroupId(requestId, groupId).orElseThrow(GroupMemberNotFoundException::new);
    }

    private void requirePending(OwnershipTransfer transfer) {
        if (transfer.getState() != State.PENDING) {
            throw new OwnershipTransferConflictException();
        }
    }

    private TransferStatus status(OwnershipTransfer transfer) {
        Map<UUID, PublicUser> display = users.findAll(List.of(transfer.getRequesterId(), transfer.getTargetId()));
        return new TransferStatus(transfer.getId(), transfer.getGroupId(), transfer.getRequesterId(),
                display.get(transfer.getRequesterId()).username(), transfer.getTargetId(),
                display.get(transfer.getTargetId()).username(), transfer.getState(), transfer.getCreatedAt(),
                transfer.getResolvedAt());
    }

    public record TransferStatus(UUID id, UUID groupId, UUID requesterId, String requesterUsername,
            UUID targetUserId, String targetUsername, State state, Instant createdAt, Instant resolvedAt) {
    }
}
