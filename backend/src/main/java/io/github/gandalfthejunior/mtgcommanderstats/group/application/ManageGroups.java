package io.github.gandalfthejunior.mtgcommanderstats.group.application;

import java.sql.SQLException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.DisplayText;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupMembership;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.PlayGroup;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.GroupMembershipRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.PlayGroupRepository;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.UserDirectory;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.UserDirectory.PublicUser;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ManageGroups {
    private static final int CODE_GENERATION_ATTEMPTS = 5;
    private static final Pattern JOIN_CODE = Pattern.compile("[A-Za-z0-9_-]{22}");
    private static final String JOIN_CODE_CONSTRAINT = "play_groups_join_code_unique";

    private final PlayGroupRepository groups;
    private final GroupMembershipRepository memberships;
    private final UserDirectory users;
    private final JoinCodeGenerator codes;
    private final GroupCreationTransaction creation;
    private final JoinCodeRotationTransaction rotation;

    public ManageGroups(PlayGroupRepository groups, GroupMembershipRepository memberships, UserDirectory users,
            JoinCodeGenerator codes, GroupCreationTransaction creation, JoinCodeRotationTransaction rotation) {
        this.groups = groups;
        this.memberships = memberships;
        this.users = users;
        this.codes = codes;
        this.creation = creation;
        this.rotation = rotation;
    }

    public GroupSummary create(UUID actorId, String name) {
        String canonicalName = new DisplayText(name).value();
        for (int attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt++) {
            try {
                PlayGroup group = creation.create(actorId, canonicalName, codes.generate());
                return new GroupSummary(group.getId(), group.getName(), GroupRole.OWNER);
            } catch (DataIntegrityViolationException exception) {
                if (!isJoinCodeCollision(exception)) {
                    throw exception;
                }
            }
        }
        throw new IllegalStateException("Could not generate a unique group join code.");
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
        String joinCode = validJoinCode(suppliedCode);
        PlayGroup group = groups.findByJoinCodeForUpdate(joinCode).orElseThrow(InvalidJoinCodeException::new);
        GroupMembership membership = memberships.findByGroupIdAndUserId(group.getId(), actorId)
                .orElseGet(() -> memberships.save(GroupMembership.member(group.getId(), actorId)));
        if (!membership.isActive()) {
            membership.reactivateAsMember();
        }
        return summary(group, membership);
    }

    @Transactional(readOnly = true)
    public String joinCode(UUID actorId, UUID groupId) {
        PlayGroup group = groups.findById(groupId).orElseThrow(GroupNotFoundException::new);
        requireOwner(groupId, actorId);
        return group.getJoinCode();
    }

    public String regenerateJoinCode(UUID actorId, UUID groupId) {
        for (int attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt++) {
            try {
                return rotation.rotate(actorId, groupId, codes.generate());
            } catch (JoinCodeCollisionException exception) {
                // Retry with fresh entropy. A regenerated code must differ from the current value.
            } catch (DataIntegrityViolationException exception) {
                if (!isJoinCodeCollision(exception)) {
                    throw exception;
                }
            }
        }
        throw new IllegalStateException("Could not generate a unique group join code.");
    }

    @Transactional
    public void leave(UUID actorId, UUID groupId) {
        groups.findById(groupId).orElseThrow(GroupNotFoundException::new);
        activeMembership(groupId, actorId).leave();
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

    private boolean isJoinCodeCollision(DataIntegrityViolationException exception) {
        Throwable cause = exception;
        while (cause != null) {
            if (cause instanceof ConstraintViolationException constraintViolation) {
                return JOIN_CODE_CONSTRAINT.equals(constraintViolation.getConstraintName());
            }
            if (cause instanceof SQLException sqlException
                    && "23505".equals(sqlException.getSQLState())
                    && sqlException.getMessage().contains(JOIN_CODE_CONSTRAINT)) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
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
