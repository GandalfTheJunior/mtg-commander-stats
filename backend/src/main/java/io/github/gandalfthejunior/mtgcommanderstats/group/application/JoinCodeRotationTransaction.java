package io.github.gandalfthejunior.mtgcommanderstats.group.application;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupMembership;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.PlayGroup;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.GroupMembershipRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.PlayGroupRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
class JoinCodeRotationTransaction {
    private final PlayGroupRepository groups;
    private final GroupMembershipRepository memberships;

    JoinCodeRotationTransaction(PlayGroupRepository groups, GroupMembershipRepository memberships) {
        this.groups = groups;
        this.memberships = memberships;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    String rotate(UUID actorId, UUID groupId, String joinCode) {
        PlayGroup group = groups.findByIdForUpdate(groupId).orElseThrow(GroupNotFoundException::new);
        GroupMembership actor = memberships.findByGroupIdAndUserId(groupId, actorId)
                .filter(GroupMembership::isActive)
                .orElseThrow(GroupAccessDeniedException::new);
        if (actor.getRole() != GroupRole.OWNER) {
            throw new GroupAccessDeniedException();
        }
        if (group.getJoinCode().equals(joinCode)) {
            throw new JoinCodeCollisionException();
        }
        group.regenerateJoinCode(joinCode);
        groups.flush();
        return group.getJoinCode();
    }
}
