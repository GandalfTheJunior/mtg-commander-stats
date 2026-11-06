package io.github.gandalfthejunior.mtgcommanderstats.quickprofile.application;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.ManageDecks;
import io.github.gandalfthejunior.mtgcommanderstats.game.application.GameParticipations;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupAccessDeniedException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.QuickProfileAccess;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageProfileInvitations;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.QuickProfiles;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Quick profiles (#223): credential-less placeholder members managed by their group's members. */
@Service
@Transactional
public class ManageQuickProfiles {
    private final QuickProfileAccess access;
    private final QuickProfiles profiles;
    private final QuickProfileNameGenerator names;
    private final GameParticipations participations;
    private final ManageDecks decks;
    private final ManageProfileInvitations invitations;

    public ManageQuickProfiles(QuickProfileAccess access, QuickProfiles profiles, QuickProfileNameGenerator names,
            GameParticipations participations, ManageDecks decks, ManageProfileInvitations invitations) {
        this.access = access;
        this.profiles = profiles;
        this.names = names;
        this.participations = participations;
        this.decks = decks;
        this.invitations = invitations;
    }

    /** Any active member; the group lock serializes name generation within the group. */
    public QuickProfileSummary create(UUID actorId, UUID groupId) {
        access.lockActiveMember(groupId, actorId);
        String name = names.generate(profiles.canonicalNames(groupId), profiles::canonicalize);
        User profile = profiles.create(groupId, name);
        access.join(profile);
        return QuickProfileSummary.from(profile);
    }

    /** Any active member; free text under the username rules, unique among the group's profiles. */
    public QuickProfileSummary rename(UUID actorId, UUID groupId, UUID profileId, String name) {
        access.lockActiveMember(groupId, actorId);
        return QuickProfileSummary.from(profiles.rename(access.activeProfile(groupId, profileId), name));
    }

    /**
     * OWNER/ADMIN only. Without games, the profile and its decks are physically deleted. With games, it is
     * anonymized: name replaced, membership deactivated and decks archived, so history stays intact.
     */
    public void delete(UUID actorId, UUID groupId, UUID profileId) {
        GroupRole role = access.lockActiveMember(groupId, actorId);
        if (role != GroupRole.OWNER && role != GroupRole.ADMIN) {
            throw new GroupAccessDeniedException();
        }
        User profile = access.activeProfile(groupId, profileId);
        invitations.revokeForProfileDeletion(profileId);
        if (participations.hasPlayed(profileId)) {
            decks.archiveAllOwnedBy(profileId);
            access.deactivate(profile);
            profiles.anonymize(profile);
        } else {
            decks.deleteAllOwnedBy(profileId);
            access.remove(profile);
            profiles.delete(profile);
        }
    }

    public record QuickProfileSummary(UUID userId, String username, GroupRole role, boolean quickProfile) {
        static QuickProfileSummary from(User profile) {
            return new QuickProfileSummary(profile.getId(), profile.getUsername(), GroupRole.MEMBER, true);
        }
    }
}
