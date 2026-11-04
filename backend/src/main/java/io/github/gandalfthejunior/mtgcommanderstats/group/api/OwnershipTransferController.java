package io.github.gandalfthejunior.mtgcommanderstats.group.api;

import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageOwnershipTransfers;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageOwnershipTransfers.TransferStatus;
import io.github.gandalfthejunior.mtgcommanderstats.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/groups/{groupId}/ownership-transfer")
public class OwnershipTransferController {
    private final ManageOwnershipTransfers transfers;

    public OwnershipTransferController(ManageOwnershipTransfers transfers) {
        this.transfers = transfers;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TransferStatus create(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @RequestBody CreateRequest request) {
        return transfers.create(user.getId(), groupId, uuid(request.targetUserId()));
    }

    @GetMapping
    public ResponseEntity<TransferStatus> pending(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(transfers.pending(user.getId(), groupId));
    }

    @PostMapping("/accept")
    public TransferStatus accept(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @RequestBody TransitionRequest request) {
        return transfers.respond(user.getId(), groupId, uuid(request.requestId()), true);
    }

    @PostMapping("/decline")
    public TransferStatus decline(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @RequestBody TransitionRequest request) {
        return transfers.respond(user.getId(), groupId, uuid(request.requestId()), false);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void withdraw(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @RequestBody TransitionRequest request) {
        transfers.withdraw(user.getId(), groupId, uuid(request.requestId()));
    }

    @GetMapping("/notices")
    public ResponseEntity<List<TransferStatus>> notices(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(transfers.notices(user.getId(), groupId));
    }

    @PostMapping("/notices/{noticeId}/acknowledge")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void acknowledge(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @PathVariable UUID noticeId, @RequestBody(required = false) GroupController.EmptyGroupRequest request) {
        transfers.acknowledge(user.getId(), groupId, noticeId);
    }

    private UUID uuid(JsonNode value) {
        if (value == null || !value.isString()) {
            throw new InvalidGroupRequestException();
        }
        try {
            UUID parsed = UUID.fromString(value.asText());
            if (!parsed.toString().equalsIgnoreCase(value.asText())) {
                throw new InvalidGroupRequestException();
            }
            return parsed;
        } catch (IllegalArgumentException exception) {
            throw new InvalidGroupRequestException();
        }
    }

    public record CreateRequest(JsonNode targetUserId) {
        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidGroupRequestException();
        }
    }

    public record TransitionRequest(JsonNode requestId) {
        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidGroupRequestException();
        }
    }
}
