package io.github.gandalfthejunior.mtgcommanderstats.user.application;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** User-owned persistence boundary for quick profiles; callers hold the home-group lock. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class QuickProfiles {
    private static final String NAME_KEY = "users_quick_profile_name_key";

    private final UserRepository users;

    public QuickProfiles(UserRepository users) {
        this.users = users;
    }

    public User create(UUID homeGroupId, String username) {
        return flushNameChange(() -> users.save(User.quickProfile(homeGroupId, username)));
    }

    public Optional<User> find(UUID profileId) {
        return users.findById(profileId).filter(User::isQuickProfile);
    }

    public User rename(User profile, String username) {
        return flushNameChange(() -> {
            profile.renameQuickProfile(username);
            return profile;
        });
    }

    public void anonymize(User profile) {
        profile.anonymize(users.findMaxDeletedNumber(profile.getHomeGroupId()) + 1);
        users.flush();
    }

    public void delete(User profile) {
        users.delete(profile);
        users.flush();
    }

    /** Canonical names (#214 form) used by the group's non-anonymized quick profiles. */
    public Set<String> canonicalNames(UUID groupId) {
        return users.findQuickProfileCanonicalNames(groupId).stream().collect(Collectors.toSet());
    }

    public String canonicalize(String username) {
        return users.canonicalizeUsername(username);
    }

    private User flushNameChange(Supplier<User> change) {
        try {
            User profile = change.get();
            users.flush();
            return profile;
        } catch (DataIntegrityViolationException exception) {
            for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
                if (cause instanceof ConstraintViolationException constraint
                        && NAME_KEY.equals(constraint.getConstraintName())) {
                    throw new DuplicateQuickProfileNameException();
                }
            }
            throw exception;
        }
    }
}
