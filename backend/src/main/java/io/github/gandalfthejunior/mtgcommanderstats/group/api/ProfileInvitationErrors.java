package io.github.gandalfthejunior.mtgcommanderstats.group.api;

import java.net.URI;

import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupAccessDeniedException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.GroupNotFoundException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.InvalidProfileInvitationException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ProfileClaimConflictException;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.QuickProfileNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = ProfileInvitationController.class)
public class ProfileInvitationErrors {
    public static final String SAME_GAME = "PROFILE_CLAIM_SAME_GAME";
    private static final Logger LOG = LoggerFactory.getLogger(ProfileInvitationErrors.class);

    @ExceptionHandler(InvalidProfileInvitationException.class)
    public ResponseEntity<ProblemDetail> unavailable() {
        return problem(HttpStatus.BAD_REQUEST, "This invitation is unavailable.");
    }

    @ExceptionHandler({InvalidGroupRequestException.class, HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ProblemDetail> invalidRequest() {
        return problem(HttpStatus.BAD_REQUEST, "Invalid request.");
    }

    @ExceptionHandler(ProfileClaimConflictException.class)
    public ResponseEntity<ProblemDetail> sameGame() {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                "The account and profile participated in the same game.");
        detail.setInstance(URI.create("/api/profile-invitations"));
        detail.setProperty("code", SAME_GAME);
        return ResponseEntity.status(HttpStatus.CONFLICT).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(detail);
    }

    @ExceptionHandler(GroupAccessDeniedException.class)
    public ResponseEntity<ProblemDetail> forbidden() {
        return problem(HttpStatus.FORBIDDEN, "An active OWNER or ADMIN membership is required.");
    }

    @ExceptionHandler({GroupNotFoundException.class, QuickProfileNotFoundException.class})
    public ResponseEntity<ProblemDetail> notFound() {
        return problem(HttpStatus.NOT_FOUND, "Requested group resource not found.");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> unexpected(Exception exception) {
        LOG.error("Profile invitation request failed: exceptionType={}", exception.getClass().getName());
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "The request could not be completed. Retry later.");
    }

    private ResponseEntity<ProblemDetail> problem(HttpStatus status, String message) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(status, message);
        detail.setInstance(URI.create("/api/profile-invitations"));
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(detail);
    }
}
