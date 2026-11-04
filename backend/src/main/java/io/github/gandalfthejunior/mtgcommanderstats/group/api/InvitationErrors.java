package io.github.gandalfthejunior.mtgcommanderstats.group.api;

import java.net.URI;

import io.github.gandalfthejunior.mtgcommanderstats.group.application.InvalidJoinCodeException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Keep secret-bearing preview failures out of the servlet container's error dispatch and logs. */
@RestControllerAdvice(assignableTypes = InvitationController.class)
public class InvitationErrors {
    @ExceptionHandler(InvalidJoinCodeException.class)
    public ResponseEntity<ProblemDetail> unavailable() {
        return problem(HttpStatus.BAD_REQUEST, "This invitation is unavailable.");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> unexpectedFailure() {
        // Exception messages and stack traces may contain the token or the complete request path.
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "The invitation could not be checked. Retry later.");
    }

    private ResponseEntity<ProblemDetail> problem(HttpStatus status, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setInstance(URI.create("/api/invitations"));
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(problem);
    }
}
