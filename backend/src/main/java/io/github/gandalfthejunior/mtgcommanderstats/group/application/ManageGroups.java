package io.github.gandalfthejunior.mtgcommanderstats.group.application;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.DisplayText;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupMembership;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.PlayGroup;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.GroupMembershipRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.InvitationRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.PlayGroupRepository;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.UserDirectory;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.UserDirectory.PublicUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ManageGroups {
    private static final Pattern JOIN_CODE = Pattern.compile("[A-Za-z0-9_-]{22}");

    private final PlayGroupRepository groups;
    private final GroupMembershipRepository memberships;
    private final UserDirectory users;
    private final JoinCodeGenerator codes;
    private final GroupCreationTransaction creation;
    private final InvitationRepository invitations;

    public ManageGroups(PlayGroupRepository groups, GroupMembershipRepository memberships, UserDirectory users,
            JoinCodeGenerator codes, GroupCreationTransaction creation,
            InvitationRepository invitations) {
        this.groups = groups;
        this.memberships = memberships;
        this.users = users;
        this.codes = codes;
        this.creation = creation;
        this.invitations = invitations;
    }

    public GroupSummary create(UUID actorId, String name) {
        String canonicalName = new DisplayText(name).value();
        PlayGroup group = creation.create(actorId, canonicalName);
        return new GroupSummary(group.getId(), group.getName(), GroupRole.OWNER);
    }

    @Transactional(readOnly = true)
    public List<GroupSummary> list(UUID actorId) {
        List<GroupMembership> activeMemberships = memberships.findAllByUserIdAndActiveTrue(actorId);
        Map<UUID, PlayGroup> joinedGroups = groups.findAllById(activeMemberships.stream()
                        .map(GroupMembership::getGroupId).toList()).stream()
                .collect(Collectors.toMap(PlayGroup::getId, group -> group));
        return activeMemberships.stream()
                .map(membership -> summary(joinedGroups.get(membership.getGroupId()), membership))
                .sorted(Comparator.comparing(GroupSummary::name).thenComparing(GroupSummary::id))
                .toList();
    }

    @Transactional(readOnly = true)
    public GroupDetails details(UUID actorId, UUID groupId) {
        PlayGroup group = groups.findById(groupId).orElseThrow(GroupNotFoundException::new);
        GroupMembership actor = activeMembership(groupId, actorId);
        List<GroupMembership> activeMembers = memberships.findAllByGroupIdAndActiveTrue(groupId);
        Map<UUID, PublicUser> publicUsers = users.findAll(activeMembers.stream()
                .map(GroupMembership::getUserId).toList());
        List<MemberSummary> memberSummaries = activeMembers.stream()
                .map(membership -> memberSummary(membership, publicUsers))
                .sorted(Comparator.comparing(MemberSummary::role)
                        .thenComparing(MemberSummary::username)
                        .thenComparing(MemberSummary::userId))
                .toList();
        return new GroupDetails(group.getId(), group.getName(), actor.getRole(), memberSummaries);
    }

    @Transactional
    public GroupSummary join(UUID actorId, String suppliedCode) {
        String hash = InvitationToken.hash(validJoinCode(suppliedCode));
        UUID groupId = invitations.groupId(hash).orElseThrow(InvalidJoinCodeException::new);
        PlayGroup group = groups.findByIdForUpdate(groupId).orElseThrow(InvalidJoinCodeException::new);
        // All membership operations lock the group first; invitation state is checked after that lock.
        if (!invitations.available(hash)) {
            throw new InvalidJoinCodeException();
        }
        GroupMembership membership = memberships.findByGroupIdAndUserId(groupId, actorId).orElse(null);
        if (membership != null && membership.isActive()) {
            throw new AlreadyGroupMemberException();
        }
        if (membership == null) {
            membership = memberships.save(GroupMembership.member(groupId, actorId));
        } else {
            membership.reactivateAsMember();
        }
        memberships.flush();
        // Use wall-clock database time after lock waits and membership writes, not transaction start time.
        if (!invitations.consume(hash, actorId)) {
            throw new InvalidJoinCodeException();
        }
        return summary(group, membership);
    }

    @Transactional
    public Invitation createInvitation(UUID actorId, UUID groupId) {
        groups.findByIdForUpdate(groupId).orElseThrow(GroupNotFoundException::new);
        activeMembership(groupId, actorId);
        for (int attempt = 0; attempt < 5; attempt++) {
            String code = codes.generate();
            Optional<Instant> expiresAt = invitations.create(InvitationToken.hash(code), groupId, actorId);
            if (expiresAt.isPresent()) {
                return new Invitation(code, expiresAt.get());
            }
        }
        throw new IllegalStateException("Could not generate a unique invitation.");
    }

    @Transactional(readOnly = true)
    public InvitationPreview preview(String code) {
        return new InvitationPreview(invitations.preview(InvitationToken.hash(validJoinCode(code)))
                .orElseThrow(InvalidJoinCodeException::new));
    }

    public record Invitation(String code, Instant expiresAt) {
    }

    public record InvitationPreview(String groupName) {
    }

    @Transactional
    public void leave(UUID actorId, UUID groupId) {
        groups.findByIdForUpdate(groupId).orElseThrow(GroupNotFoundException::new);
        activeMembership(groupId, actorId).leave();
    }

    @Transactional
    public MemberSummary changeRole(UUID actorId, UUID groupId, UUID userId, GroupRole role) {
        groups.findByIdForUpdate(groupId).orElseThrow(GroupNotFoundException::new);
        requireOwner(groupId, actorId);
        if (role != GroupRole.ADMIN && role != GroupRole.MEMBER) {
            throw new IllegalArgumentException("Only ADMIN and MEMBER roles may be requested.");
        }
        GroupMembership target = activeTarget(groupId, userId);
        if (target.getRole() == GroupRole.OWNER) {
            throw new GroupAccessDeniedException();
        }
        target.changeRole(role);
        return memberSummary(target, users.findAll(List.of(userId)));
    }

    @Transactional
    public void removeMember(UUID actorId, UUID groupId, UUID userId) {
        groups.findByIdForUpdate(groupId).orElseThrow(GroupNotFoundException::new);
        GroupRole role = activeMembership(groupId, actorId).getRole();
        if (role != GroupRole.OWNER && role != GroupRole.ADMIN) {
            throw new GroupAccessDeniedException();
        }
        GroupMembership target = activeTarget(groupId, userId);
        if (target.getRole() != GroupRole.MEMBER) {
            throw new GroupAccessDeniedException();
        }
        target.leave();
    }

    private GroupMembership activeTarget(UUID groupId, UUID userId) {
        return memberships.findByGroupIdAndUserId(groupId, userId)
                .filter(GroupMembership::isActive)
                .orElseThrow(GroupMemberNotFoundException::new);
    }

    private GroupMembership activeMembership(UUID groupId, UUID userId) {
        return memberships.findByGroupIdAndUserId(groupId, userId)
                .filter(GroupMembership::isActive)
                .orElseThrow(GroupAccessDeniedException::new);
    }

    private void requireOwner(UUID groupId, UUID actorId) {
        if (activeMembership(groupId, actorId).getRole() != GroupRole.OWNER) {
            throw new GroupAccessDeniedException();
        }
    }

    private String validJoinCode(String suppliedCode) {
        try {
            String code = new DisplayText(suppliedCode).value();
            if (!JOIN_CODE.matcher(code).matches()) {
                throw new InvalidJoinCodeException();
            }
            return code;
        } catch (RuntimeException exception) {
            if (exception instanceof InvalidJoinCodeException) {
                throw exception;
            }
            throw new InvalidJoinCodeException();
        }
    }

    private GroupSummary summary(PlayGroup group, GroupMembership membership) {
        return new GroupSummary(group.getId(), group.getName(), membership.getRole());
    }

    private MemberSummary memberSummary(GroupMembership membership, Map<UUID, PublicUser> publicUsers) {
        PublicUser user = publicUsers.get(membership.getUserId());
        return new MemberSummary(user.id(), user.username(), membership.getRole());
    }

    public record GroupSummary(UUID id, String name, GroupRole role) {
    }

    public record GroupDetails(UUID id, String name, GroupRole role, List<MemberSummary> members) {
    }

    public record MemberSummary(UUID userId, String username, GroupRole role) {
    }
}
