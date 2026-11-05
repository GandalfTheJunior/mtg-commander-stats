package io.github.gandalfthejunior.mtgcommanderstats.user.application;

import java.util.ArrayList;
import java.util.List;

import io.github.gandalfthejunior.mtgcommanderstats.user.domain.InvalidRegistrationException;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.InvalidRegistrationException.Reason;
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
    private final EmailAddressValidator emailAddresses;

    public RegisterUser(UserRepository users, PasswordEncoder passwords, EmailAddressValidator emailAddresses) {
        this.users = users;
        this.passwords = passwords;
        this.emailAddresses = emailAddresses;
    }

    @Transactional
    public User register(String email, String username, String password) {
        List<Reason> reasons = new ArrayList<>();
        String canonicalEmail = null;
        if (emailAddresses.canCanonicalize(email)) {
            canonicalEmail = users.canonicalizeEmail(email);
        }
        if (!emailAddresses.isValid(canonicalEmail)) {
            reasons.add(Reason.INVALID_EMAIL);
        }
        String trimmedUsername = null;
        try {
            trimmedUsername = User.trimUsername(username);
        } catch (InvalidRegistrationException exception) {
            reasons.addAll(exception.reasons());
        }
        try {
            User.validatePassword(password);
        } catch (InvalidRegistrationException exception) {
            reasons.addAll(exception.reasons());
        }
        if (!reasons.isEmpty()) {
            throw new InvalidRegistrationException(reasons);
        }
        User user = new User(canonicalEmail, trimmedUsername, passwords.encode(password));
        try {
            // Flush inside this boundary so concurrent duplicates receive the same result.
            return users.saveAndFlush(user);
        } catch (DataIntegrityViolationException exception) {
            for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
                if (cause instanceof ConstraintViolationException constraint
                        && "users_email_key".equals(constraint.getConstraintName())) {
                    throw new DuplicateEmailException();
                }
            }
            throw exception;
        }
    }
}
