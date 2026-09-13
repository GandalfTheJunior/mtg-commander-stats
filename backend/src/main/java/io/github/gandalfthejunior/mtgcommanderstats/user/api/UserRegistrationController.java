package io.github.gandalfthejunior.mtgcommanderstats.user.api;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.user.application.RegisterUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UserRegistrationController {
    private final RegisterUser registerUser;

    public UserRegistrationController(RegisterUser registerUser) {
        this.registerUser = registerUser;
    }

    @PostMapping("/api/users")
    @ResponseStatus(HttpStatus.CREATED)
    public RegisteredUser register(@RequestBody RegistrationRequest request) {
        var user = registerUser.register(request.username(), request.password());
        return new RegisteredUser(user.getId(), user.getUsername());
    }

    public record RegistrationRequest(String username, String password) {
        @Override
        public String toString() {
            return "RegistrationRequest[redacted]";
        }
    }

    public record RegisteredUser(UUID id, String username) {
    }
}
