package io.github.gandalfthejunior.mtgcommanderstats;

import java.util.concurrent.atomic.AtomicBoolean;

import io.github.gandalfthejunior.mtgcommanderstats.RegistrationSecurityTest.Config;
import io.github.gandalfthejunior.mtgcommanderstats.security.SecurityConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;

import static org.assertj.core.api.Assertions.assertThat;

@SpringJUnitWebConfig(Config.class)
class RegistrationSecurityTest {
    @Autowired
    private SecurityFilterChain chain;

    @Test
    void productionCsrfFilterExemptsOnlyRegistrationPost() throws Exception {
        assertCsrf("POST", "/api/users", true);
        assertCsrf("GET", "/api/users", true);
        assertCsrf("POST", "/api/users/", false);
        assertCsrf("POST", "/api/users/other", false);
        assertCsrf("POST", "/other", false);
        assertCsrf("PUT", "/api/users", false);
        assertCsrf("PATCH", "/api/users", false);
        assertCsrf("DELETE", "/api/users", false);
    }

    private void assertCsrf(String method, String path, boolean allowed) throws Exception {
        CsrfFilter csrf = chain.getFilters().stream().filter(CsrfFilter.class::isInstance)
                .map(CsrfFilter.class::cast).findFirst().orElseThrow();
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setServletPath(path);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean continued = new AtomicBoolean();
        // Isolate the real configured CSRF filter so authorization cannot mask a disabled CSRF check.
        csrf.doFilter(request, response, (req, res) -> continued.set(true));
        assertThat(continued.get()).as("%s %s", method, path).isEqualTo(allowed);
        if (!allowed) {
            assertThat(response.getStatus()).isEqualTo(HttpStatus.FORBIDDEN.value());
        }
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebSecurity
    @Import(SecurityConfiguration.class)
    static class Config {
        @Bean
        UserDetailsService users() {
            return username -> {
                throw new UsernameNotFoundException("unknown");
            };
        }
    }
}
