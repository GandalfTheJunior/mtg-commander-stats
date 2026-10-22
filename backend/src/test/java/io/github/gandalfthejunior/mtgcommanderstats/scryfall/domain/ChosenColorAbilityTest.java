package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.stream.Stream;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class ChosenColorAbilityTest {
    @ParameterizedTest(name = "{0}")
    @MethodSource("commanderAbilities")
    void recognizesKnownWordingWithoutAnIdOrNameAllowlist(String fixture, String oracleText) {
        assertThat(ChosenColorAbility.requiresChosenColor(oracleText)).isTrue();
    }

    static Stream<Arguments> commanderAbilities() {
        return Stream.of(
                Arguments.of("The Prismatic Piper", "If The Prismatic Piper is your commander, choose a color "
                        + "before the game begins. The Prismatic Piper is the chosen color.\nPartner"),
                Arguments.of("Faceless One", "If Faceless One is your commander, choose a color before the game "
                        + "begins. Faceless One is the chosen color.\nChoose a Background"),
                Arguments.of("Clara Oswald", "If Clara Oswald is your commander, choose a color before the game "
                        + "begins. She is the chosen color.\nDoctor's companion"),
                Arguments.of("unseen Commander", "If A Newly Discovered Hero is your commander, choose a color "
                        + "before the game begins. A Newly Discovered Hero is the chosen color."),
                Arguments.of("unseen Commander with punctuation", "If Dr. Chromatic is your commander, choose a "
                        + "color before the game begins. Dr. Chromatic is the chosen color."),
                Arguments.of("whitespace and case", "IF New Hero IS YOUR COMMANDER,\nCHOOSE A COLOR BEFORE THE "
                        + "GAME BEGINS.\u00a0\tNEW HERO IS THE CHOSEN COLOR."));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
            " ",
            "Whenever you cast an artifact spell, you may pay {2}. If you do, draw a card.",
            "As this creature enters, choose a color. This creature is the chosen color.",
            "Choose a color. Creatures you control gain protection from the chosen color until end of turn.",
            "If Test is your commander, choose a color before the game begins. You gain protection from that color.",
            "Choose a color before the game begins. Test is the chosen color.",
            "If Test is your commander, choose a color before the game begins. Another Card is the chosen color.",
            "If Dr. Chromatic is your commander, choose a color before the game begins. Another Card is the chosen color.",
            "If Test is your commander, choose a color before the game begins. Draw a card. Test is the chosen color."
    })
    void rejectsNormalColorlessCommandersAndUnrelatedColorChoices(String oracleText) {
        assertThat(ChosenColorAbility.requiresChosenColor(oracleText)).isFalse();
    }
}
