package io.github.gandalfthejunior.mtgcommanderstats.user.api;

import io.github.gandalfthejunior.mtgcommanderstats.user.application.DuplicateEmailException;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.InvalidRegistrationException;
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
    public ProblemDetail internalError(Exception exception) {
        // Exception messages and throwable rendering can contain credentials or request values.
        Throwable cause = NestedExceptionUtils.getMostSpecificCause(exception);
        LOGGER.error("Unexpected registration failure; exceptionType={}, causeType={}, causeStack={}",
                exception.getClass().getName(), cause.getClass().getName(), cause.getStackTrace());
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
                "Registration could not be completed.");
    }
}
