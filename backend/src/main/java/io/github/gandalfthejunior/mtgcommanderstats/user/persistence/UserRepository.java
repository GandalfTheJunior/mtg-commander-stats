package io.github.gandalfthejunior.mtgcommanderstats.user.persistence;

import java.util.UUID;
import java.util.Optional;

import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByUsername(String username);

    // The same Unicode canonicalization function also guards direct database writes.
    @Query(value = "SELECT canonical_username(:username)", nativeQuery = true)
    String canonicalizeUsername(@Param("username") String username);
}
