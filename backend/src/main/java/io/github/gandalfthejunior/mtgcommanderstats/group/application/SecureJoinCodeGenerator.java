package io.github.gandalfthejunior.mtgcommanderstats.group.application;

import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.stereotype.Component;

@Component
public class SecureJoinCodeGenerator implements JoinCodeGenerator {
    private static final int CODE_BYTES = 16;
    private final SecureRandom random = new SecureRandom();

    @Override
    public String generate() {
        byte[] bytes = new byte[CODE_BYTES];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
