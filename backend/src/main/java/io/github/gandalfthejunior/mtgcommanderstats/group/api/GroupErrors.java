package io.github.gandalfthejunior.mtgcommanderstats.group.api;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidDisplayTextException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupAccessDeniedException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupNotFoundException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.InvalidJoinCodeException;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.OwnerCannotLeaveException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = GroupController.class)
public class GroupErrors {
    @ExceptionHandler({InvalidDisplayTextException.class, InvalidJoinCodeException.class,
            InvalidGroupRequestException.class,
            HttpMessageNotReadableException.class, MethodArgumentNotValidException.class,
            MethodArgumentTypeMismatchException.class})
    public ProblemDetail invalidInput() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Provide only the documented request fields, with a nonblank name or valid current code as required.");
    }

    @ExceptionHandler(GroupNotFoundException.class)
    public ProblemDetail notFound() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Group not found.");
    }

    @ExceptionHandler({GroupAccessDeniedException.class, OwnerCannotLeaveException.class})
    public ProblemDetail forbidden() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN,
                "Active group membership with the required role is needed.");
    }
}
