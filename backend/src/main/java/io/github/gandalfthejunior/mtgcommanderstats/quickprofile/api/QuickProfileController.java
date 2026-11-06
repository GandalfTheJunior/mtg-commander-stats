package io.github.gandalfthejunior.mtgcommanderstats.quickprofile.api;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import io.github.gandalfthejunior.mtgcommanderstats.quickprofile.application.ManageQuickProfiles;
import io.github.gandalfthejunior.mtgcommanderstats.quickprofile.application.ManageQuickProfiles.QuickProfileSummary;
import io.github.gandalfthejunior.mtgcommanderstats.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class QuickProfileController {
    private final ManageQuickProfiles profiles;

    public QuickProfileController(ManageQuickProfiles profiles) {
        this.profiles = profiles;
    }

    @PostMapping("/api/groups/{groupId}/quick-profiles")
    @ResponseStatus(HttpStatus.CREATED)
    public QuickProfileSummary create(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @RequestBody(required = false) EmptyRequest request) {
        return profiles.create(user.getId(), groupId);
    }

    @PatchMapping("/api/groups/{groupId}/quick-profiles/{profileId}")
    public QuickProfileSummary rename(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @PathVariable UUID profileId, @RequestBody RenameRequest request) {
        return profiles.rename(user.getId(), groupId, profileId, request.name());
    }

    @DeleteMapping("/api/groups/{groupId}/quick-profiles/{profileId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @PathVariable UUID profileId, @RequestBody(required = false) EmptyRequest request) {
        profiles.delete(user.getId(), groupId, profileId);
    }

    /** The server generates the name; the create request accepts no fields. */
    public record EmptyRequest() {
        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidQuickProfileRequestException();
        }
    }

    public record RenameRequest(String name) {
        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidQuickProfileRequestException();
        }
    }
}
