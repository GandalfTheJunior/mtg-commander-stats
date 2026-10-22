package io.github.gandalfthejunior.mtgcommanderstats.scryfall.api;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.InvalidScryfallRequestException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.InvalidScryfallSelectionException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.MalformedScryfallResponseException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = ScryfallController.class)
public class ScryfallErrors {
    @ExceptionHandler({InvalidScryfallRequestException.class, InvalidScryfallSelectionException.class,
            MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    public ProblemDetail invalidInput() {
        return problem(HttpStatus.BAD_REQUEST, "INVALID_SCRYFALL_REQUEST",
                "Provide a card name of 2–100 characters, a valid printing UUID and a valid gameplay selection.");
    }

    @ExceptionHandler(ScryfallClientException.class)
    public ProblemDetail upstream(ScryfallClientException exception) {
        if (exception.kind() == ScryfallClientException.Kind.NOT_FOUND) {
            return problem(HttpStatus.NOT_FOUND, "CARD_NOT_FOUND", "Card not found.");
        }
        return unavailable();
    }

    @ExceptionHandler(MalformedScryfallResponseException.class)
    public ProblemDetail unavailable() {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "SCRYFALL_UNAVAILABLE",
                "Scryfall is currently imprisoned in the moon… Please try again later.");
    }

    private static ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setProperty("code", code);
        return problem;
    }
}
