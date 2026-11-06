package io.github.gandalfthejunior.mtgcommanderstats.group.api;

import java.io.IOException;
import java.time.Clock;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

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
    private static final Pattern PROFILE_ACCEPT = Pattern.compile("/api/profile-invitations/[^/]+/accept");
    private final Map<String, Window> peers = new LinkedHashMap<>();
    private final Clock clock;

    public InvitationRequestLimit() {
        this(Clock.systemUTC());
    }

    InvitationRequestLimit(Clock clock) {
        this.clock = clock;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return !("GET".equals(request.getMethod()) && (path.startsWith("/api/invitations/")
                || path.startsWith("/api/profile-invitations/")))
                && !("POST".equals(request.getMethod()) && ("/api/groups/join".equals(path)
                || PROFILE_ACCEPT.matcher(path).matches()));
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
        peer = peerKey(peer);
        long now = clock.millis();
        peers.values().removeIf(window -> now - window.start >= 60_000);
        Window window = peers.get(peer);
        if (window == null) {
            if (peers.size() >= MAX_PEERS) {
                // Insertion order follows window creation time, including deterministic ties.
                peers.remove(peers.keySet().iterator().next());
            }
            window = new Window(now);
            peers.put(peer, window);
        }
        if (window.count >= REQUESTS_PER_MINUTE) {
            return false;
        }
        window.count++;
        return true;
    }

    synchronized void clear() {
        peers.clear();
    }

    private static String peerKey(String peer) {
        try {
            // Parse literals only: never perform DNS lookups for request metadata.
            InetAddress address = InetAddress.ofLiteral(peer);
            if (address instanceof Inet6Address) {
                return "ipv6:" + HexFormat.of().formatHex(address.getAddress(), 0, 8) + "/64";
            }
            return address.getHostAddress();
        } catch (IllegalArgumentException exception) {
            return peer;
        }
    }

    private static final class Window {
        private final long start;
        private int count;

        private Window(long start) {
            this.start = start;
        }
    }
}
