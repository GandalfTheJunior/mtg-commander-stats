package io.github.gandalfthejunior.mtgcommanderstats.group.application;

import java.util.Optional;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupMembership;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.GroupMembershipRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.PlayGroupRepository;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.QuickProfiles;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Group-owned authorization and membership boundary for quick profiles. Every operation starts by
 * locking the group row, the same lock taken by membership changes and game writes.
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class QuickProfileAccess {
    private final PlayGroupRepository groups;
    private final GroupMembershipRepository memberships;
    private final QuickProfiles profiles;

    public QuickProfileAccess(PlayGroupRepository groups, GroupMembershipRepository memberships,
            QuickProfiles profiles) {
        this.groups = groups;
        this.memberships = memberships;
        this.profiles = profiles;
    }

    /** Locks the group and returns the actor's active role. */
    public GroupRole lockActiveMember(UUID groupId, UUID actorId) {
        groups.findByIdForUpdate(groupId).orElseThrow(GroupNotFoundException::new);
        return membership(groupId, actorId).filter(GroupMembership::isActive).map(GroupMembership::getRole)
                .orElseThrow(GroupAccessDeniedException::new);
    }

    /** Call after group authorization; management writes lock the group first. */
    public User activeProfile(UUID groupId, UUID profileId) {
        return membership(groupId, profileId).filter(GroupMembership::isActive)
                .flatMap(membership -> profiles.find(profileId))
                .filter(profile -> groupId.equals(profile.getHomeGroupId()) && !profile.isDeleted())
                .orElseThrow(QuickProfileNotFoundException::new);
    }

    public void join(User profile) {
        memberships.saveAndFlush(GroupMembership.member(profile.getHomeGroupId(), profile.getId()));
    }

    /** Anonymized profiles keep their history but are no longer members or selectable for games. */
    public void deactivate(User profile) {
        membership(profile.getHomeGroupId(), profile.getId()).orElseThrow(QuickProfileNotFoundException::new).leave();
        memberships.flush();
    }

    public void remove(User profile) {
        memberships.delete(membership(profile.getHomeGroupId(), profile.getId())
                .orElseThrow(QuickProfileNotFoundException::new));
        memberships.flush();
    }

    private Optional<GroupMembership> membership(UUID groupId, UUID userId) {
        return memberships.findByGroupIdAndUserId(groupId, userId);
    }
}
