package io.github.gandalfthejunior.mtgcommanderstats.displaytext.api;

import java.util.List;
import java.util.Map;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidNameException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

public final class NameProblems {
    private NameProblems() {
    }

    public static ProblemDetail invalidName(InvalidNameException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        String code = switch (exception.reason()) {
            case BLANK -> "NAME_BLANK";
            case INVALID_CHARACTERS -> "NAME_INVALID_CHARACTERS";
            case TOO_LONG -> "NAME_TOO_LONG";
        };
        problem.setProperty("errors", List.of(exception.reason() == InvalidNameException.Reason.TOO_LONG
                ? Map.of("field", "name", "code", code, "maxLength", exception.maxLength())
                : Map.of("field", "name", "code", code)));
        return problem;
    }
}
