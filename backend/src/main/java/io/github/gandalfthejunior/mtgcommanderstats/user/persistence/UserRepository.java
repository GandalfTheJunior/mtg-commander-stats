package io.github.gandalfthejunior.mtgcommanderstats.user.persistence;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {
}
