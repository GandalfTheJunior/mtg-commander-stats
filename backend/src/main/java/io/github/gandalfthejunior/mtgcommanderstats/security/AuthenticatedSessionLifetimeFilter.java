package io.github.gandalfthejunior.mtgcommanderstats.security;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Applies {@link AuthenticatedSessionLifetime} before the security context is resolved. It is
 * registered only inside the Spring Security filter chain, after CSRF validation, so an expired
 * session yields an anonymous request ({@code 401} for protected APIs) rather than a CSRF error.
 */
final class AuthenticatedSessionLifetimeFilter extends OncePerRequestFilter {
    private final AuthenticatedSessionLifetime lifetime;

    AuthenticatedSessionLifetimeFilter(AuthenticatedSessionLifetime lifetime) {
        this.lifetime = lifetime;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        HttpSession session = request.getSession(false);
        if (session != null) {
            lifetime.enforce(session);
        }
        chain.doFilter(request, response);
    }
}
