package io.github.gandalfthejunior.mtgcommanderstats.deck.api;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.DeckAccessDeniedException;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.DeckNotFoundException;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckLifecycleConflictException;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.InvalidColorIdentityException;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.InvalidCommanderException;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidDisplayTextException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = DeckController.class)
public class DeckErrors {
    @ExceptionHandler({InvalidCommanderException.class, InvalidDisplayTextException.class, InvalidColorIdentityException.class,
            HttpMessageNotReadableException.class, InvalidArchiveRequestException.class,
            MethodArgumentTypeMismatchException.class})
    public ProblemDetail invalidInput() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Provide a valid deck UUID, nonblank name and exactly one standalone Commander with its required color."
                        + " Printing/artwork changes require the artwork endpoint; archive requests must be empty.");
    }

    @ExceptionHandler({DeckLifecycleConflictException.class, DataIntegrityViolationException.class,
            ConcurrencyFailureException.class})
    public ProblemDetail conflict() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                "Used decks retain their commander and color identity and must be archived instead of deleted."
                        + " A concurrent state conflict may require retrying the request.");
    }

    @ExceptionHandler(DeckNotFoundException.class)
    public ProblemDetail notFound() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Deck not found.");
    }

    @ExceptionHandler(DeckAccessDeniedException.class)
    public ProblemDetail forbidden() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "You do not own this deck.");
    }
}
