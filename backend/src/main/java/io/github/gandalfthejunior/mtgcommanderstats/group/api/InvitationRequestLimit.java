package io.github.gandalfthejunior.mtgcommanderstats.group.api;

import java.io.IOException;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Bounded per-peer abuse control; forwarded headers are deliberately not trusted. */
@Component
public class InvitationRequestLimit extends OncePerRequestFilter {
    private static final int MAX_PEERS = 4096;
    private static final int REQUESTS_PER_MINUTE = 120;
    private final Map<String, Window> peers = new HashMap<>();
    private final Clock clock;

    public InvitationRequestLimit() {
        this(Clock.systemUTC());
    }

    InvitationRequestLimit(Clock clock) {
        this.clock = clock;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !("GET".equals(request.getMethod()) && request.getRequestURI().startsWith("/api/invitations/"))
                && !("POST".equals(request.getMethod()) && "/api/groups/join".equals(request.getRequestURI()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        if (!admit(request.getRemoteAddr())) {
            response.setStatus(429);
            response.setHeader("Retry-After", "60");
            response.setContentType("application/problem+json");
            response.getWriter().write("{\"status\":429,\"title\":\"Too Many Requests\",\"detail\":\"Retry later.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    synchronized boolean admit(String peer) {
        long now = clock.millis();
        peers.values().removeIf(window -> now - window.start >= 60_000);
        Window window = peers.get(peer);
        if (window == null) {
            if (peers.size() >= MAX_PEERS) {
                return false;
            }
            window = new Window(now);
            peers.put(peer, window);
        }
        return ++window.count <= REQUESTS_PER_MINUTE;
    }

    private static final class Window {
        private final long start;
        private int count;

        private Window(long start) {
            this.start = start;
        }
    }
}
