package io.github.gandalfthejunior.mtgcommanderstats.user.application;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserDirectory {
    private final UserRepository users;

    public UserDirectory(UserRepository users) {
        this.users = users;
    }

    @Transactional(readOnly = true)
    public Map<UUID, PublicUser> findAll(Collection<UUID> userIds) {
        return users.findAllById(userIds).stream()
                .map(user -> new PublicUser(user.getId(), user.getUsername()))
                .collect(Collectors.toMap(PublicUser::id, Function.identity()));
    }

    public record PublicUser(UUID id, String username) {
    }
}
