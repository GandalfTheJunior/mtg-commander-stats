package io.github.gandalfthejunior.mtgcommanderstats.user.application;

import io.github.gandalfthejunior.mtgcommanderstats.security.UserPrincipal;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserAuthenticationDetails implements UserDetailsService {
    private final UserRepository users;
    private final EmailAddressValidator emailAddresses;

    public UserAuthenticationDetails(UserRepository users, EmailAddressValidator emailAddresses) {
        this.users = users;
        this.emailAddresses = emailAddresses;
    }

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String email) {
        String canonicalEmail = users.canonicalizeEmail(email);
        if (!emailAddresses.isValid(canonicalEmail)) {
            throw new UsernameNotFoundException("Invalid credentials.");
        }
        User user = users.findByEmail(canonicalEmail)
                .orElseThrow(() -> new UsernameNotFoundException("Invalid credentials."));
        return new UserPrincipal(user.getId(), user.getEmail(), user.getUsername(), user.getEncodedPassword());
    }
}
