package io.github.gandalfthejunior.mtgcommanderstats.game.api;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.game.application.ReadGroupStatistics;
import io.github.gandalfthejunior.mtgcommanderstats.game.application.ReadGroupStatistics.GroupStatistics;
import io.github.gandalfthejunior.mtgcommanderstats.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class GroupStatisticsController {
    private final ReadGroupStatistics statistics;

    public GroupStatisticsController(ReadGroupStatistics statistics) {
        this.statistics = statistics;
    }

    @GetMapping("/api/groups/{groupId}/statistics")
    public GroupStatistics get(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId,
            @RequestParam MultiValueMap<String, String> query) {
        Integer playerCount = null;
        if (query.containsKey("playerCount")) {
            if (query.get("playerCount").size() != 1 || !query.getFirst("playerCount").matches("[2-6]")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Provide playerCount exactly once as an integer from 2 through 6.");
            }
            playerCount = Integer.valueOf(query.getFirst("playerCount"));
        }
        return statistics.read(user.getId(), groupId, playerCount);
    }
}
