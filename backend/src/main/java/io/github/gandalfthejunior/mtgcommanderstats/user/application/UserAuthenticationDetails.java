package io.github.gandalfthejunior.mtgcommanderstats.user.application;

import io.github.gandalfthejunior.mtgcommanderstats.security.UserPrincipal;
import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserAuthenticationDetails implements UserDetailsService {
    private final UserRepository users;

    public UserAuthenticationDetails(UserRepository users) {
        this.users = users;
    }

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) {
        var user = users.findByUsername(users.canonicalizeUsername(username))
                .orElseThrow(() -> new UsernameNotFoundException("Invalid credentials."));
        return new UserPrincipal(user.getId(), user.getUsername(), user.getEncodedPassword());
    }
}
