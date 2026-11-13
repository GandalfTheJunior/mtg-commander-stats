package io.github.gandalfthejunior.mtgcommanderstats.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

/**
 * Server-side lifetime policy for authenticated browser sessions (#303).
 *
 * <p>A successful password login records its server time in the session. Every later request
 * enforces a 30-day absolute limit from that login and a 7-day sliding idle limit. The idle limit
 * is the session's max-inactive interval, enforced by Spring Session on every read; it is capped
 * by the remaining absolute lifetime so that persisted expiry times never exceed the hard limit.
 */
final class AuthenticatedSessionLifetime {
    static final Duration IDLE_TIMEOUT = Duration.ofDays(7);
    static final Duration ABSOLUTE_TIMEOUT = Duration.ofDays(30);
    static final String AUTHENTICATED_AT = AuthenticatedSessionLifetime.class.getName() + ".AUTHENTICATED_AT";

    private final Clock clock;

    AuthenticatedSessionLifetime(Clock clock) {
        this.clock = clock;
    }

    /** Starts a new authenticated lifetime after a successful password login. */
    void start(HttpSession session) {
        session.setAttribute(AUTHENTICATED_AT, clock.instant());
        session.setMaxInactiveInterval(seconds(IDLE_TIMEOUT));
    }

    /**
     * Enforces the absolute limit and caps the idle interval.
     *
     * @return {@code false} when the session was invalidated
     */
    boolean enforce(HttpSession session) {
        Object start = session.getAttribute(AUTHENTICATED_AT);
        Object context = session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        if (start == null && context == null) {
            return true; // Anonymous CSRF-bootstrap session keeps its short default lifetime.
        }
        // Missing, unreadable or inconsistent authentication state fails closed.
        if (!(start instanceof Instant authenticatedAt) || !(context instanceof SecurityContext securityContext)
                || securityContext.getAuthentication() == null) {
            session.invalidate();
            return false;
        }
        Duration remaining = Duration.between(clock.instant(), authenticatedAt.plus(ABSOLUTE_TIMEOUT));
        if (!remaining.isPositive()) {
            session.invalidate();
            return false;
        }
        int idle = seconds(remaining.compareTo(IDLE_TIMEOUT) < 0 ? remaining : IDLE_TIMEOUT);
        if (session.getMaxInactiveInterval() != idle) {
            session.setMaxInactiveInterval(idle);
        }
        return true;
    }

    private static int seconds(Duration duration) {
        // Round up: the absolute check above, not the idle interval, ends the final partial second.
        return Math.toIntExact(duration.getSeconds() + (duration.getNano() > 0 ? 1 : 0));
    }
}
