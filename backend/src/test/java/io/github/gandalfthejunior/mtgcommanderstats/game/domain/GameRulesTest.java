package io.github.gandalfthejunior.mtgcommanderstats.game.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GameRulesTest {
    @Test
    void playedOnIsIndependentOfImmutableIdentityAndChangesOnlyOnExplicitReplacement() {
        List<GameParticipant> players = normal(List.of(1, 2));
        Game unknown = new Game(UUID.randomUUID(), UUID.randomUUID(), players, GameResult.WIN, false);
        assertThat(unknown.getPlayedOn()).isNull();
        Game game = new Game(UUID.randomUUID(), UUID.randomUUID(), players, GameResult.WIN, false,
                LocalDate.of(2000, 2, 29));
        UUID id = game.getId();
        Instant recordedAt = game.getRecordedAt();
        game.replace(players, GameResult.WIN, false);
        assertThat(game.getPlayedOn()).isEqualTo(LocalDate.of(2000, 2, 29));
        game.replace(players, GameResult.WIN, false, LocalDate.of(2026, 10, 31));
        assertThat(game.getPlayedOn()).isEqualTo(LocalDate.of(2026, 10, 31));
        assertThatThrownBy(() -> game.replace(List.of(), GameResult.WIN, false, null))
                .isInstanceOf(InvalidGameException.class);
        assertThat(game.getPlayedOn()).isEqualTo(LocalDate.of(2026, 10, 31));
        game.replace(players, GameResult.WIN, false, null);
        assertThat(game.getPlayedOn()).isNull();
        assertThat(game.getId()).isEqualTo(id);
        assertThat(game.getRecordedAt()).isEqualTo(recordedAt);
    }

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
        for (GameParticipant invalid : List.of(p(4, 3, null, false), p(4, 2, null, false),
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

    @Test
    void unknownRanksRemainUnknownAndWinnerAndSurvivalDoNotDependOnSeatOrArrayOrder() {
        List<GameParticipant> players = normal(Arrays.asList(null, 4, 1, null));
        Game game = new Game(UUID.randomUUID(), UUID.randomUUID(), players, GameResult.WIN, false);
        assertThat(players.stream().map(game::placement)).containsExactly(null, 4, 1, null);
        assertThat(players.stream().map(game::stillInGame)).containsExactly(false, false, true, false);
        assertThat(game.getWinnerUserId()).isEqualTo(players.get(2).getUserId());
        game.replace(normal(Arrays.asList(null, null, 1, null)), GameResult.WIN, false);
        assertThat(game.getParticipants().stream().map(game::placement)).containsExactly(null, null, 1, null);

        List<GameParticipant> alternate = List.of(p(1, null, null, false), p(2, null, null, true),
                p(3, null, true, null), p(4, 4, null, false));
        game.replace(alternate, GameResult.WIN, true);
        assertThat(alternate.stream().map(game::placement)).containsExactly(null, 2, 1, 4);
        assertThat(alternate.stream().map(game::stillInGame)).containsExactly(false, true, true, false);
        assertThat(game.getWinnerUserId()).isEqualTo(alternate.get(2).getUserId());
    }

    @Test
    void everyPartialRankingForTwoThroughSixPlayersAgreesWithAnIndependentCompletionOracle() {
        for (int size = 2; size <= 6; size++) {
            List<List<Integer>> completions = new ArrayList<>();
            completeRankings(new ArrayList<>(List.of(1)), size, completions);
            checkPartialRankings(new ArrayList<>(List.of(1)), size, completions);
        }
    }

    // Enumerate ordered tie-group sizes, independently of the production gap validator.
    private void completeRankings(List<Integer> prefix, int size, List<List<Integer>> completions) {
        if (prefix.size() == size) {
            completions.add(List.copyOf(prefix));
            return;
        }
        for (int tied = 1; tied <= size - prefix.size(); tied++) {
            List<Integer> next = new ArrayList<>(prefix);
            for (int i = 0; i < tied; i++) {
                next.add(prefix.size() + 1);
            }
            completeRankings(next, size, completions);
        }
    }

    private void checkPartialRankings(List<Integer> ranks, int size, List<List<Integer>> completions) {
        if (ranks.size() < size) {
            for (int rank = 1; rank <= size; rank++) {
                List<Integer> next = new ArrayList<>(ranks);
                next.add(rank == 1 ? null : rank);
                checkPartialRankings(next, size, completions);
            }
            return;
        }
        boolean possible = completions.stream().anyMatch(complete -> ranks.stream().filter(rank -> rank != null)
                .allMatch(rank -> ranks.stream().filter(rank::equals).count()
                        <= complete.stream().filter(rank::equals).count()));
        List<GameParticipant> players = normal(ranks);
        if (possible) {
            assertThatCode(() -> Game.validate(players, GameResult.WIN, false)).as("%s", ranks).doesNotThrowAnyException();
        } else {
            assertThatThrownBy(() -> Game.validate(players, GameResult.WIN, false)).as("%s", ranks)
                    .isInstanceOf(InvalidGameException.class);
        }
        long survivors = ranks.stream().filter(Integer.valueOf(2)::equals).count();
        if (survivors > 0) {
            List<GameParticipant> alternate = new ArrayList<>();
            for (int i = 0; i < ranks.size(); i++) {
                Integer rank = ranks.get(i);
                if (i == 0) { alternate.add(p(i + 1, null, true, null)); }
                else if (Integer.valueOf(2).equals(rank)) { alternate.add(p(i + 1, null, null, true)); }
                else { alternate.add(p(i + 1, rank, null, false)); }
            }
            boolean alternatePossible = completions.stream()
                    .filter(complete -> complete.stream().filter(Integer.valueOf(2)::equals).count() == survivors)
                    .anyMatch(complete -> ranks.stream().filter(rank -> rank != null)
                            .allMatch(rank -> ranks.stream().filter(rank::equals).count()
                                    <= complete.stream().filter(rank::equals).count()));
            if (alternatePossible) {
                assertThatCode(() -> Game.validate(alternate, GameResult.WIN, true)).as("alternate %s", ranks).doesNotThrowAnyException();
            } else {
                assertThatThrownBy(() -> Game.validate(alternate, GameResult.WIN, true)).as("alternate %s", ranks)
                        .isInstanceOf(InvalidGameException.class);
            }
        }
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
