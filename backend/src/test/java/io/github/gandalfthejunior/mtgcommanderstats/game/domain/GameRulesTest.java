package io.github.gandalfthejunior.mtgcommanderstats.game.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GameRulesTest {
    @Test
    void competitionRanksAcceptTiesAndRejectDenseRanksGapsAndDuplicateWinners() {
        for (List<Integer> ranks : List.of(List.of(1, 2), List.of(1, 2, 2, 4), List.of(1, 2, 2, 2, 5, 5))) {
            assertThatCode(() -> Game.validate(normal(ranks), GameResult.WIN, false)).doesNotThrowAnyException();
        }
        for (List<Integer> ranks : List.of(List.of(1, 2, 2, 3), List.of(1, 1), List.of(2, 2), List.of(1, 3), List.of(1, 0), List.of(1, -1))) {
            assertThatThrownBy(() -> Game.validate(normal(ranks), GameResult.WIN, false)).isInstanceOf(InvalidGameException.class);
        }
    }

    @Test
    void alternateWinnerSurvivorsAndManualEliminationsHaveOneCanonicalRepresentation() {
        List<GameParticipant> players = new ArrayList<>();
        players.add(p(1, null, true, null));
        players.add(p(2, null, null, true));
        players.add(p(3, null, null, true));
        players.add(p(4, 4, null, false));
        players.add(p(5, 5, null, false));
        Game game = new Game(UUID.randomUUID(), UUID.randomUUID(), players, GameResult.WIN, true);
        assertThat(players.stream().map(game::placement)).containsExactly(1, 2, 2, 4, 5);
        assertThat(players.stream().map(game::stillInGame)).containsExactly(true, true, true, false, false);
        assertThat(game.getWinnerUserId()).isEqualTo(players.getFirst().getUserId());
        for (GameParticipant invalid : List.of(p(4, 3, null, false), p(4, 2, null, false), p(4, null, null, false),
                p(4, 4, false, false), p(4, 4, true, false), p(4, 4, null, true))) {
            List<GameParticipant> changed = new ArrayList<>(players); changed.set(3, invalid);
            assertThatThrownBy(() -> Game.validate(changed, GameResult.WIN, true)).isInstanceOf(InvalidGameException.class);
        }
        for (List<GameParticipant> invalid : List.of(
                List.of(p(1, null, true, null), p(2, 2, null, false)),
                List.of(p(1, 1, true, null), p(2, null, null, true)),
                List.of(p(1, null, true, true), p(2, null, null, true)),
                List.of(p(1, null, null, true), p(2, null, null, true)),
                List.of(p(1, null, true, null), p(2, null, true, null)))) {
            assertThatThrownBy(() -> Game.validate(invalid, GameResult.WIN, true)).isInstanceOf(InvalidGameException.class);
        }
    }

    @Test
    void drawNeedsASurvivorAndRejectsPlacementsAndWinnerMarkers() {
        Game game = new Game(UUID.randomUUID(), UUID.randomUUID(), List.of(p(1, null, null, true), p(2, null, null, false)), GameResult.DRAW, false);
        assertThat(game.getWinnerUserId()).isNull();
        assertThat(game.getParticipants().stream().map(game::placement)).containsOnlyNulls();
        for (List<GameParticipant> invalid : List.of(
                List.of(p(1, null, null, false), p(2, null, null, false)),
                List.of(p(1, 1, null, true), p(2, null, null, true)),
                List.of(p(1, null, false, true), p(2, null, null, true)),
                List.of(p(1, null, null, null), p(2, null, null, true)))) {
            assertThatThrownBy(() -> Game.validate(invalid, GameResult.DRAW, false)).isInstanceOf(InvalidGameException.class);
        }
        assertThatThrownBy(() -> Game.validate(game.getParticipants(), GameResult.DRAW, true)).isInstanceOf(InvalidGameException.class);
    }

    private List<GameParticipant> normal(List<Integer> ranks) {
        List<GameParticipant> players = new ArrayList<>();
        for (int i = 0; i < ranks.size(); i++) { players.add(p(i + 1, ranks.get(i), null, null)); }
        return players;
    }

    private GameParticipant p(int seat, Integer rank, Boolean winner, Boolean survivor) {
        return new GameParticipant(UUID.randomUUID(), UUID.randomUUID(), seat, rank, winner, survivor);
    }
}
