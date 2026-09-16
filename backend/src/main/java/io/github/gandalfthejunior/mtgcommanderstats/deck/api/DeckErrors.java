package io.github.gandalfthejunior.mtgcommanderstats.deck.api;

import io.github.gandalfthejunior.mtgcommanderstats.deck.application.DeckAccessDeniedException;
import io.github.gandalfthejunior.mtgcommanderstats.deck.application.DeckNotFoundException;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.InvalidColorIdentityException;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidDisplayTextException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = DeckController.class)
public class DeckErrors {
    @ExceptionHandler({InvalidDisplayTextException.class, InvalidColorIdentityException.class,
            HttpMessageNotReadableException.class})
    public ProblemDetail invalidInput() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Provide a nonblank name and commander and a valid color identity.");
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
