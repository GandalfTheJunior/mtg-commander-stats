package io.github.gandalfthejunior.mtgcommanderstats.group.api;

import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageGroups;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class InvitationController {
    private final ManageGroups groups;

    public InvitationController(ManageGroups groups) {
        this.groups = groups;
    }

    @GetMapping("/api/invitations/{code}")
    public ResponseEntity<ManageGroups.InvitationPreview> preview(@PathVariable String code) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(groups.preview(code));
    }
}
