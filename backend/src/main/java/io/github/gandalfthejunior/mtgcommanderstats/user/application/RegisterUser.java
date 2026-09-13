package io.github.gandalfthejunior.mtgcommanderstats.user.application;

import io.github.gandalfthejunior.mtgcommanderstats.user.domain.User;
import io.github.gandalfthejunior.mtgcommanderstats.user.persistence.UserRepository;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RegisterUser {
    private final UserRepository users;
    private final PasswordEncoder passwords;

    public RegisterUser(UserRepository users, PasswordEncoder passwords) {
        this.users = users;
        this.passwords = passwords;
    }

    @Transactional
    public User register(String username, String password) {
        String trimmedUsername = User.trimUsername(username);
        User.validatePassword(password);
        String canonicalUsername = users.canonicalizeUsername(trimmedUsername);
        User user = new User(canonicalUsername, passwords.encode(password));
        try {
            // Flush inside this boundary so concurrent duplicates receive the same result.
            return users.saveAndFlush(user);
        } catch (DataIntegrityViolationException exception) {
            for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
                if (cause instanceof ConstraintViolationException constraint
                        && "users_username_key".equals(constraint.getConstraintName())) {
                    throw new DuplicateUsernameException();
                }
            }
            throw exception;
        }
    }
}
