package io.github.gandalfthejunior.mtgcommanderstats.group.application;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupMembership;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.GroupMembershipRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.PlayGroupRepository;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.ProfileInvitationRepository;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.QuickProfiles;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ManageProfileInvitations {
    private static final Pattern CODE = Pattern.compile("[A-Za-z0-9_-]{22}");
    private final QuickProfileAccess access;
    private final QuickProfiles profiles;
    private final ProfileInvitationRepository invitations;
    private final PlayGroupRepository groups;
    private final GroupMembershipRepository memberships;
    private final UserRepository users;
    private final JoinCodeGenerator codes;

    public ManageProfileInvitations(QuickProfileAccess access, QuickProfiles profiles,
            ProfileInvitationRepository invitations, PlayGroupRepository groups,
            GroupMembershipRepository memberships, UserRepository users, JoinCodeGenerator codes) {
        this.access = access;
        this.profiles = profiles;
        this.invitations = invitations;
        this.groups = groups;
        this.memberships = memberships;
        this.users = users;
        this.codes = codes;
    }

    @Transactional
    public Invitation create(UUID actorId, UUID groupId, UUID profileId) {
        requireManager(actorId, groupId);
        access.activeProfile(groupId, profileId);
        invitations.revoke(profileId);
        for (int attempt = 0; attempt < 5; attempt++) {
            String code = codes.generate();
            Optional<Instant> expiry = invitations.create(InvitationToken.hash(code), profileId, groupId, actorId);
            if (expiry.isPresent()) {
                return new Invitation(code, expiry.get());
            }
        }
        throw new IllegalStateException("Could not generate a unique profile invitation.");
    }

    @Transactional
    public Status current(UUID actorId, UUID groupId, UUID profileId) {
        requireManager(actorId, groupId);
        access.activeProfile(groupId, profileId);
        Instant expiry = invitations.current(profileId).orElse(null);
        return new Status(expiry != null, expiry);
    }

    @Transactional
    public void revoke(UUID actorId, UUID groupId, UUID profileId) {
        requireManager(actorId, groupId);
        access.activeProfile(groupId, profileId);
        invitations.revoke(profileId);
    }

    @Transactional(readOnly = true)
    public ProfileInvitationRepository.Preview preview(String code) {
        return invitations.preview(hash(code)).orElseThrow(InvalidProfileInvitationException::new);
    }

    @Transactional
    public void accept(UUID accountId, String code) {
        String hash = hash(code);
        UUID groupId = invitations.groupId(hash).orElseThrow(InvalidProfileInvitationException::new);
        groups.findByIdForUpdate(groupId).orElseThrow(InvalidProfileInvitationException::new);
        UUID profileId = invitations.availableProfile(hash).orElseThrow(InvalidProfileInvitationException::new);
        User account = users.findById(accountId).filter(user -> !user.isQuickProfile())
                .orElseThrow(InvalidProfileInvitationException::new);
        User profile;
        try {
            profile = access.activeProfile(groupId, profileId);
        } catch (QuickProfileNotFoundException exception) {
            throw new InvalidProfileInvitationException();
        }
        // Game writes take the group lock before deck locks; use that same order.
        invitations.lockDecks(profileId, account.getId());
        if (invitations.sameGame(profileId, accountId)) {
            throw new ProfileClaimConflictException();
        }
        invitations.repoint(profileId, accountId);
        GroupMembership existing = memberships.findByGroupIdAndUserId(groupId, accountId).orElse(null);
        if (existing == null) {
            memberships.save(GroupMembership.member(groupId, accountId));
        } else if (!existing.isActive()) {
            existing.reactivateAsMember();
        }
        access.remove(profile);
        memberships.flush();
        if (!invitations.consume(hash, accountId)) {
            throw new InvalidProfileInvitationException();
        }
        profiles.delete(profile);
    }

    private void requireManager(UUID actorId, UUID groupId) {
        GroupRole role = access.lockActiveMember(groupId, actorId);
        if (role != GroupRole.OWNER && role != GroupRole.ADMIN) {
            throw new GroupAccessDeniedException();
        }
    }

    private String hash(String code) {
        if (code == null || !CODE.matcher(code).matches()) {
            throw new InvalidProfileInvitationException();
        }
        return InvitationToken.hash(code);
    }

    public record Invitation(String code, Instant expiresAt) {
    }

    public record Status(boolean active, Instant expiresAt) {
    }
}
