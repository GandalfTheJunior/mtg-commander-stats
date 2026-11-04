package io.github.gandalfthejunior.mtgcommanderstats.group.api;

import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageGroups;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageGroups.GroupDetails;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageGroups.GroupSummary;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageGroups.MemberSummary;
import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupRole;
import io.github.gandalfthejunior.mtgcommanderstats.security.UserPrincipal;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
public class GroupController {
    private final ManageGroups groups;

    public GroupController(ManageGroups groups) {
        this.groups = groups;
    }

    @PostMapping("/api/groups")
    @ResponseStatus(HttpStatus.CREATED)
    public GroupSummaryResponse create(@AuthenticationPrincipal UserPrincipal user,
            @RequestBody CreateGroupRequest request) {
        return GroupSummaryResponse.from(groups.create(user.getId(), request.name()));
    }

    @GetMapping("/api/groups")
    public List<GroupSummaryResponse> list(@AuthenticationPrincipal UserPrincipal user) {
        return groups.list(user.getId()).stream().map(GroupSummaryResponse::from).toList();
    }

    @GetMapping("/api/groups/{groupId}")
    public GroupDetailsResponse details(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId) {
        return GroupDetailsResponse.from(groups.details(user.getId(), groupId));
    }

    @PostMapping("/api/groups/join")
    public GroupSummaryResponse join(@AuthenticationPrincipal UserPrincipal user,
            @RequestBody JoinGroupRequest request) {
        return GroupSummaryResponse.from(groups.join(user.getId(), request.code()));
    }

    @GetMapping("/api/groups/{groupId}/join-code")
    public ResponseEntity<JoinCodeResponse> joinCode(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID groupId) {
        return noStore(groups.joinCode(user.getId(), groupId));
    }

    @PostMapping("/api/groups/{groupId}/join-code")
    public ResponseEntity<JoinCodeResponse> regenerateJoinCode(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID groupId, @RequestBody(required = false) EmptyGroupRequest request) {
        return noStore(groups.regenerateJoinCode(user.getId(), groupId));
    }

    @DeleteMapping("/api/groups/{groupId}/membership")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void leave(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @RequestBody(required = false) EmptyGroupRequest request) {
        groups.leave(user.getId(), groupId);
    }

    @PatchMapping("/api/groups/{groupId}/members/{userId}/role")
    public MemberResponse changeRole(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID groupId, @PathVariable UUID userId, @RequestBody ChangeRoleRequest request) {
        return MemberResponse.from(groups.changeRole(user.getId(), groupId, userId, request.targetRole()));
    }

    @DeleteMapping("/api/groups/{groupId}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeMember(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID groupId, @PathVariable UUID userId,
            @RequestBody(required = false) EmptyGroupRequest request) {
        groups.removeMember(user.getId(), groupId, userId);
    }

    public record ChangeRoleRequest(JsonNode role) {
        GroupRole targetRole() {
            if (role == null || !role.isString()
                    || !(role.asText().equals("ADMIN") || role.asText().equals("MEMBER"))) {
                throw new InvalidGroupRequestException();
            }
            return GroupRole.valueOf(role.asText());
        }

        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidGroupRequestException();
        }
    }

    private ResponseEntity<JoinCodeResponse> noStore(String code) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new JoinCodeResponse(code));
    }

    public record CreateGroupRequest(String name) {
        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidGroupRequestException();
        }
    }

    public record JoinGroupRequest(String code) {
        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidGroupRequestException();
        }
    }

    public record EmptyGroupRequest() {
        @JsonAnySetter
        public void rejectUnknownField(String field, Object value) {
            throw new InvalidGroupRequestException();
        }
    }

    public record GroupSummaryResponse(UUID id, String name, GroupRole role) {
        static GroupSummaryResponse from(GroupSummary summary) {
            return new GroupSummaryResponse(summary.id(), summary.name(), summary.role());
        }
    }

    public record GroupDetailsResponse(UUID id, String name, GroupRole role, List<MemberResponse> members) {
        static GroupDetailsResponse from(GroupDetails details) {
            return new GroupDetailsResponse(details.id(), details.name(), details.role(),
                    details.members().stream().map(MemberResponse::from).toList());
        }
    }

    public record MemberResponse(UUID userId, String username, GroupRole role) {
        static MemberResponse from(MemberSummary member) {
            return new MemberResponse(member.userId(), member.username(), member.role());
        }
    }

    public record JoinCodeResponse(String code) {
    }
}
