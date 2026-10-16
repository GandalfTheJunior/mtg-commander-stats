package io.github.gandalfthejunior.mtgcommanderstats.game.api;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.game.application.ReadGroupStatistics;
import io.github.gandalfthejunior.mtgcommanderstats.game.application.ReadGroupStatistics.GroupStatistics;
import io.github.gandalfthejunior.mtgcommanderstats.security.UserPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class GroupStatisticsController {
    private final ReadGroupStatistics statistics;

    public GroupStatisticsController(ReadGroupStatistics statistics) {
        this.statistics = statistics;
    }

    @GetMapping("/api/groups/{groupId}/statistics")
    public GroupStatistics get(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID groupId) {
        return statistics.read(user.getId(), groupId);
    }
}
