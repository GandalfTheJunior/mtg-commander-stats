package io.github.gandalfthejunior.mtgcommanderstats.security;

import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfLogoutHandler;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SessionController {
    private final AuthenticationManager authenticationManager;
    private final SessionAuthenticationStrategy sessions;
    private final SecurityContextRepository contexts;
    private final SecurityContextLogoutHandler logout;
    private final CsrfLogoutHandler csrfLogout;

    public SessionController(AuthenticationManager authenticationManager, SessionAuthenticationStrategy sessions,
            SecurityContextRepository contexts, CsrfTokenRepository csrfTokens) {
        this.authenticationManager = authenticationManager;
        this.sessions = sessions;
        this.contexts = contexts;
        this.logout = new SecurityContextLogoutHandler();
        this.logout.setSecurityContextRepository(contexts);
        this.csrfLogout = new CsrfLogoutHandler(csrfTokens);
    }

    @GetMapping("/api/csrf")
    public CsrfResponse csrf(CsrfToken token) {
        // Resolving the deferred, masked token also creates the bootstrap session.
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }

    @PostMapping("/api/session")
    public CurrentUser login(@RequestBody LoginRequest credentials,
            HttpServletRequest request, HttpServletResponse response) {
        var authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(
                        credentials.username() == null ? "" : credentials.username(),
                        credentials.password() == null ? "" : credentials.password()));
        sessions.onAuthentication(authentication, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        return currentUser((UserPrincipal) authentication.getPrincipal());
    }

    @GetMapping("/api/me")
    public CurrentUser currentUser(@AuthenticationPrincipal UserPrincipal user) {
        return new CurrentUser(user.getId(), user.getUsername());
    }

    @DeleteMapping("/api/session")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request, HttpServletResponse response, Authentication authentication) {
        csrfLogout.logout(request, response, authentication);
        logout.logout(request, response, authentication);
    }

    @ExceptionHandler(AuthenticationException.class)
    public ProblemDetail invalidCredentials() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Invalid credentials.");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail malformedRequest() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Provide username and password JSON.");
    }

    public record LoginRequest(String username, String password) {}
    public record CurrentUser(UUID id, String username) {}
    public record CsrfResponse(String headerName, String token) {}
}
