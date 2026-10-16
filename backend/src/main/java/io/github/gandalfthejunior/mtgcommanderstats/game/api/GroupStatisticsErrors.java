package io.github.gandalfthejunior.mtgcommanderstats.game.api;

import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupAccessDeniedException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupNotFoundException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = GroupStatisticsController.class)
public class GroupStatisticsErrors {
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ProblemDetail invalidInput() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Provide a valid group UUID.");
    }

    @ExceptionHandler(GroupAccessDeniedException.class)
    public ProblemDetail forbidden() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Active group membership is needed.");
    }

    @ExceptionHandler(GroupNotFoundException.class)
    public ProblemDetail notFound() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Requested group resource not found.");
    }

    @ExceptionHandler({DataIntegrityViolationException.class, ConcurrencyFailureException.class})
    public ProblemDetail conflict() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                "The request conflicts with persisted state. Reload and retry.");
    }
}
