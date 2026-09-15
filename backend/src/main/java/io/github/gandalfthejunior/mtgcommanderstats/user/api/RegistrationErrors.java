package io.github.gandalfthejunior.mtgcommanderstats.user.api;

import io.github.gandalfthejunior.mtgcommanderstats.user.application.DuplicateEmailException;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.InvalidRegistrationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = UserRegistrationController.class)
public class RegistrationErrors {
    @ExceptionHandler({InvalidRegistrationException.class, HttpMessageNotReadableException.class})
    public ProblemDetail invalidInput() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Provide a valid email, a nonblank username, and a nonblank password of at least 12 characters.");
    }

    @ExceptionHandler(DuplicateEmailException.class)
    public ProblemDetail duplicateEmail() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Email is already registered.");
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail internalError() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
                "Registration could not be completed.");
    }
}
