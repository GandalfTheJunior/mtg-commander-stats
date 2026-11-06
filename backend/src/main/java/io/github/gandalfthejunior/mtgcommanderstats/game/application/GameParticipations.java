package io.github.gandalfthejunior.mtgcommanderstats.game.application;

import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.game.persistence.GameRepository;
import io.github.gandalfthejunior.mtgcommanderstats.game.persistence.ParticipationClaimRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Game-owned participation lookup; callers hold the relevant group lock. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class GameParticipations {
    private final GameRepository games;
    private final ParticipationClaimRepository claims;

    public GameParticipations(GameRepository games, ParticipationClaimRepository claims) {
        this.games = games;
        this.claims = claims;
    }

    public boolean hasPlayed(UUID userId) {
        return games.hasParticipant(userId);
    }

    /** Call after the home-group and deck locks, before moving either owner or participation. */
    public boolean conflictsWithClaim(UUID profileId, UUID accountId) {
        return claims.sameGame(profileId, accountId);
    }

    public void moveForClaim(UUID profileId, UUID accountId) {
        claims.move(profileId, accountId);
    }
}
