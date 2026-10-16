package io.github.gandalfthejunior.mtgcommanderstats.group.application;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupMembership;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.GroupMembershipRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.PlayGroupRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Group-owned authorization boundary; callers retain the lock until transaction completion. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class GameGroupAccess {
    private final PlayGroupRepository groups;
    private final GroupMembershipRepository memberships;

    public GameGroupAccess(PlayGroupRepository groups, GroupMembershipRepository memberships) {
        this.groups = groups;
        this.memberships = memberships;
    }

    public GroupRole lockActiveMember(UUID groupId, UUID actorId) {
        // Join, leave, code rotation and all game operations share this lock.
        groups.findByIdForUpdate(groupId).orElseThrow(GroupNotFoundException::new);
        return memberships.findByGroupIdAndUserId(groupId, actorId)
                .filter(GroupMembership::isActive).map(GroupMembership::getRole)
                .orElseThrow(GroupAccessDeniedException::new);
    }

    public boolean isActiveMember(UUID groupId, UUID userId) {
        return memberships.findByGroupIdAndUserId(groupId, userId)
                .filter(GroupMembership::isActive).isPresent();
    }
}
