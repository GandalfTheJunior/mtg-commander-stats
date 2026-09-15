package io.github.gandalfthejunior.mtgcommanderstats.user.application;

import jakarta.validation.Validator;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.stereotype.Component;

@Component
public class EmailAddressValidator {
    private final Validator validator;

    public EmailAddressValidator(Validator validator) {
        this.validator = validator;
    }

    public boolean isValid(String email) {
        return validator.validate(new Candidate(email)).isEmpty();
    }

    private record Candidate(@NotBlank @Email String email) {
    }
}
