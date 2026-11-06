package io.github.gandalfthejunior.mtgcommanderstats.group.api;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageProfileInvitations;
import io.github.gandalfthejunior.mtgcommanderstats.group.persistence.ProfileInvitationRepository;
import io.github.gandalfthejunior.mtgcommanderstats.security.UserPrincipal;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ProfileInvitationController {
    private final ManageProfileInvitations invitations;

    public ProfileInvitationController(ManageProfileInvitations invitations) {
        this.invitations = invitations;
    }

    @PostMapping("/api/groups/{groupId}/quick-profiles/{profileId}/invitation")
    public ResponseEntity<ManageProfileInvitations.Invitation> create(@AuthenticationPrincipal UserPrincipal actor,
            @PathVariable UUID groupId, @PathVariable UUID profileId,
            @RequestBody(required = false) EmptyRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(invitations.create(actor.getId(), groupId, profileId));
    }

    @GetMapping("/api/groups/{groupId}/quick-profiles/{profileId}/invitation")
    public ResponseEntity<ManageProfileInvitations.Status> current(@AuthenticationPrincipal UserPrincipal actor,
            @PathVariable UUID groupId, @PathVariable UUID profileId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(invitations.current(actor.getId(), groupId, profileId));
    }

    @DeleteMapping("/api/groups/{groupId}/quick-profiles/{profileId}/invitation")
    public ResponseEntity<Void> revoke(@AuthenticationPrincipal UserPrincipal actor,
            @PathVariable UUID groupId, @PathVariable UUID profileId,
            @RequestBody(required = false) EmptyRequest request) {
        invitations.revoke(actor.getId(), groupId, profileId);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping("/api/profile-invitations/{code}")
    public ResponseEntity<ProfileInvitationRepository.Preview> preview(@PathVariable String code) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(invitations.preview(code));
    }

    @PostMapping("/api/profile-invitations/{code}/accept")
    public ResponseEntity<Void> accept(@AuthenticationPrincipal UserPrincipal actor, @PathVariable String code,
            @RequestBody(required = false) EmptyRequest request) {
        invitations.accept(actor.getId(), code);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    public record EmptyRequest() {
        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidGroupRequestException();
        }
    }
}
