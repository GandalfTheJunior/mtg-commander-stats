package io.github.gandalfthejunior.mtgcommanderstats.game.application;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.game.persistence.GameRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Game-owned participation lookup; callers hold the relevant group lock. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class GameParticipations {
    private final GameRepository games;

    public GameParticipations(GameRepository games) {
        this.games = games;
    }

    public boolean hasPlayed(UUID userId) {
        return games.hasParticipant(userId);
    }
}
