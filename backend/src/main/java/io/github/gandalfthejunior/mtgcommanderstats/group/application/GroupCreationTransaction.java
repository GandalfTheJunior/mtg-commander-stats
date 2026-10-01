package io.github.gandalfthejunior.mtgcommanderstats.group.application;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupMembership;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.PlayGroup;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.GroupMembershipRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.PlayGroupRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
class GroupCreationTransaction {
    private final PlayGroupRepository groups;
    private final GroupMembershipRepository memberships;

    GroupCreationTransaction(PlayGroupRepository groups, GroupMembershipRepository memberships) {
        this.groups = groups;
        this.memberships = memberships;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    PlayGroup create(UUID ownerId, String name, String joinCode) {
        PlayGroup group = groups.saveAndFlush(new PlayGroup(ownerId, name, joinCode));
        memberships.saveAndFlush(GroupMembership.owner(group.getId(), ownerId));
        return group;
    }
}
