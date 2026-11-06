package io.github.gandalfthejunior.mtgcommanderstats.quickprofile.api;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidNameException;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.api.NameProblems;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupAccessDeniedException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupNotFoundException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.QuickProfileNotFoundException;
import io.github.gandalfthejunior.mtgcommanderstats.user.application.DuplicateQuickProfileNameException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = QuickProfileController.class)
public class QuickProfileErrors {
    public static final String NAME_TAKEN = "QUICK_PROFILE_NAME_TAKEN";

    @ExceptionHandler(InvalidNameException.class)
    public ProblemDetail invalidName(InvalidNameException exception) {
        return NameProblems.invalidName(exception);
    }

    @ExceptionHandler({InvalidQuickProfileRequestException.class, HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class})
    public ProblemDetail invalidInput() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Provide only the documented request fields: an empty body to create or delete, a name to rename.");
    }

    @ExceptionHandler({GroupNotFoundException.class, QuickProfileNotFoundException.class})
    public ProblemDetail notFound() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Requested group resource not found.");
    }

    @ExceptionHandler(GroupAccessDeniedException.class)
    public ProblemDetail forbidden() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN,
                "Active group membership with the required role is needed.");
    }

    @ExceptionHandler(DuplicateQuickProfileNameException.class)
    public ProblemDetail nameTaken(DuplicateQuickProfileNameException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.getMessage());
        problem.setProperty("code", NAME_TAKEN);
        return problem;
    }

    @ExceptionHandler({DataIntegrityViolationException.class, ConcurrencyFailureException.class})
    public ProblemDetail conflict() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                "The request conflicts with persisted state. Reload and retry.");
    }
}
