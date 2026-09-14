package io.github.gandalfthejunior.mtgcommanderstats.security;

import java.util.Map;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

@Configuration(proxyBeanMethods = false)
public class SecurityConfiguration {
    private static final String PASSWORD_ENCODER_ID = "pbkdf2@SpringSecurity_v5_8";

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        RequestMatcher registration = PathPatternRequestMatcher.withDefaults()
                .matcher(HttpMethod.POST, "/api/users");
        http.authorizeHttpRequests(authorize -> authorize
                .requestMatchers(registration).permitAll()
                .anyRequest().authenticated());
        http.csrf(csrf -> csrf.ignoringRequestMatchers(registration));
        return http.build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        // PBKDF2 supports long passphrases without bcrypt's 72-byte limit.
        return new DelegatingPasswordEncoder(PASSWORD_ENCODER_ID,
                Map.of(PASSWORD_ENCODER_ID, Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8()));
    }
}
