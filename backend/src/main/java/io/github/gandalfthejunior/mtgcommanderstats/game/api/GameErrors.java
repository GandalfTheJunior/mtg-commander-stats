package io.github.gandalfthejunior.mtgcommanderstats.game.api;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.InvalidDeckAssignmentException;
import io.github.gandalfthejunior.mtgcommanderstats.game.application.GameNotFoundException;
import io.github.gandalfthejunior.mtgcommanderstats.game.domain.InvalidGameException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupAccessDeniedException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupNotFoundException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = GameController.class)
public class GameErrors {
    @ExceptionHandler({InvalidGameException.class, InvalidDeckAssignmentException.class,
            HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ProblemDetail invalidInput() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Provide only documented fields, 2–6 distinct eligible players with their decks,"
                        + " and either WIN with one participant as winner or DRAW without a winner.");
    }

    @ExceptionHandler(GroupAccessDeniedException.class)
    public ProblemDetail forbidden() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN,
                "Active group membership and the required game permission are needed.");
    }

    @ExceptionHandler({GameNotFoundException.class, GroupNotFoundException.class})
    public ProblemDetail notFound() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Requested group resource not found.");
    }

    @ExceptionHandler({DataIntegrityViolationException.class, ConcurrencyFailureException.class})
    public ProblemDetail conflict() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                "The request conflicts with persisted state. Reload and retry.");
    }
}
