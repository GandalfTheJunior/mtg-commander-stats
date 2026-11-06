package io.github.gandalfthejunior.mtgcommanderstats.user.persistence;

import java.util.List;
import java.util.UUID;
import java.util.Optional;

import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);

    // PostgreSQL owns the canonical representation used by registration, login, and constraints.
    @Query(value = "SELECT canonical_email(:email)", nativeQuery = true)
    String canonicalizeEmail(@Param("email") String email);

    // Canonical names occupied by non-anonymized quick profiles of one group (users_quick_profile_name_key).
    @Query(value = "SELECT canonical_username(username) FROM users"
            + " WHERE kind = 'QUICK_PROFILE' AND home_group_id = :groupId AND NOT deleted", nativeQuery = true)
    List<String> findQuickProfileCanonicalNames(@Param("groupId") UUID groupId);

    @Query(value = "SELECT COALESCE(max(deleted_number), 0) FROM users WHERE home_group_id = :groupId AND deleted",
            nativeQuery = true)
    int findMaxDeletedNumber(@Param("groupId") UUID groupId);

    // The same database function backs the unique index on usernames.
    @Query(value = "SELECT canonical_username(:username)", nativeQuery = true)
    String canonicalizeUsername(@Param("username") String username);
}
