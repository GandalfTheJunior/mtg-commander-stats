package io.github.gandalfthejunior.mtgcommanderstats.user.api;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import io.github.gandalfthejunior.mtgcommanderstats.user.application.DuplicateEmailException;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.DuplicateUsernameException;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.InvalidRegistrationException;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.Username;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = UserRegistrationController.class)
public class RegistrationErrors {
    private static final Logger LOGGER = LoggerFactory.getLogger(RegistrationErrors.class);
    @ExceptionHandler(InvalidRegistrationException.class)
    public ProblemDetail invalidRegistration(InvalidRegistrationException exception) {
        String detail = exception.reasons().stream().map(reason -> switch (reason) {
            case INVALID_EMAIL -> "Provide a valid email address.";
            case BLANK_USERNAME -> "Username must not be blank.";
            case INVALID_USERNAME -> "Username contains unsupported characters or repeated spaces.";
            case LONG_USERNAME -> "Username must be at most " + Username.MAX_LENGTH + " characters long.";
            case RESERVED_USERNAME -> "Username is reserved.";
            case BLANK_PASSWORD -> "Password must not be blank or consist only of whitespace.";
            case SHORT_PASSWORD -> "Password must be at least 12 characters long.";
        }).collect(Collectors.joining(" "));
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
        problem.setProperty("errors", exception.reasons().stream().map(reason -> switch (reason) {
            case INVALID_EMAIL -> Map.of("field", "email", "code", "INVALID_EMAIL");
            case BLANK_USERNAME -> Map.of("field", "username", "code", "USERNAME_BLANK");
            case INVALID_USERNAME -> Map.of("field", "username", "code", "NAME_INVALID_CHARACTERS");
            case LONG_USERNAME -> Map.of("field", "username", "code", "NAME_TOO_LONG",
                    "maxLength", Username.MAX_LENGTH);
            case RESERVED_USERNAME -> Map.of("field", "username", "code", "USERNAME_RESERVED");
            case BLANK_PASSWORD -> Map.of("field", "password", "code", "PASSWORD_BLANK");
            case SHORT_PASSWORD -> Map.of("field", "password", "code", "PASSWORD_TOO_SHORT");
        }).toList());
        return problem;
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail invalidInput() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Provide a valid email, a nonblank username, and a nonblank password of at least 12 characters.");
    }

    @ExceptionHandler(DuplicateEmailException.class)
    public ProblemDetail duplicateEmail() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Email is already registered.");
    }

    @ExceptionHandler(DuplicateUsernameException.class)
    public ProblemDetail duplicateUsername() {
        // Usernames are public display names, so reporting a taken name is acceptable.
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Username is already taken.");
        problem.setProperty("errors", List.of(Map.of("field", "username", "code", "USERNAME_TAKEN")));
        return problem;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail internalError(Exception exception) {
        // Exception messages and throwable rendering can contain credentials or request values.
        Throwable cause = NestedExceptionUtils.getMostSpecificCause(exception);
        LOGGER.error("Unexpected registration failure; exceptionType={}, causeType={}, causeStack={}",
                exception.getClass().getName(), cause.getClass().getName(), cause.getStackTrace());
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
                "Registration could not be completed.");
    }
}
