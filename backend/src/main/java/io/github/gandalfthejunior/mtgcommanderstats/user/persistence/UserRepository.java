package io.github.gandalfthejunior.mtgcommanderstats.user.persistence;

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
}
