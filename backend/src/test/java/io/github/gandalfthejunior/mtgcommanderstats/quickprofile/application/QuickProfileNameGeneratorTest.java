package io.github.gandalfthejunior.mtgcommanderstats.quickprofile.application;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.Set;
import java.util.function.UnaryOperator;
import java.util.stream.Stream;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.NameRules;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.Username;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuickProfileNameGeneratorTest {
    // Generated names are ASCII, where the #214 canonical form equals lowercase.
    private static final UnaryOperator<String> CANONICAL = value -> value.toLowerCase(Locale.ROOT);
    private static final List<String> PROPRIETARY = List.of("Eldrazi", "Phyrexian", "Sliver", "Kor", "Kithkin",
            "Vedalken", "Thallid", "Myr", "Thopter", "Saproling");

    @Test
    void curatedWordListsSatisfyNameRulesAndYieldEnoughShortCombinations() {
        List<String> adjectives = QuickProfileNameGenerator.readList(QuickProfileNameGenerator.ADJECTIVES);
        List<String> creatureTypes = QuickProfileNameGenerator.readList(QuickProfileNameGenerator.CREATURE_TYPES);
        assertThat(adjectives).hasSize(74);
        assertThat(creatureTypes).hasSize(128).doesNotContainAnyElementsOf(PROPRIETARY);
        for (List<String> list : List.of(adjectives, creatureTypes)) {
            assertThat(list).allSatisfy(entry -> assertThat(QuickProfileNameGenerator.isValidEntry(entry))
                    .as(entry).isTrue());
            assertThat(list.stream().map(CANONICAL).distinct()).hasSameSizeAs(list);
        }
        List<String> combinations = QuickProfileNameGenerator.usableCombinations(adjectives, creatureTypes);
        assertThat(combinations).hasSizeGreaterThanOrEqualTo(2_000);
        assertThat(combinations).allSatisfy(name -> {
            assertThat(QuickProfileNameGenerator.graphemes(name)).isLessThanOrEqualTo(17);
            // Even a two-digit suffix keeps the name within the username rules.
            assertThat(NameRules.normalize(name + " 99", Username.MAX_LENGTH)).isEqualTo(name + " 99");
        });
        assertThat(combinations).contains("Hairy Zombie", "Extrovert Cat", "Spineless God")
                .doesNotContain("Trampling Shapeshifter");
    }

    @Test
    void parsingIgnoresCommentsAndBlankLines() throws Exception {
        String raw = "# heading\n\nHairy\n  # indented comment\n  Tiny  \n";
        assertThat(QuickProfileNameGenerator.parse(new ByteArrayInputStream(raw.getBytes(StandardCharsets.UTF_8))))
                .containsExactly("Hairy", "Tiny");
    }

    @Test
    void drawsFreeRandomCombinationsCaseInsensitively() {
        QuickProfileNameGenerator generator = new QuickProfileNameGenerator(List.of("Hairy", "Tiny"),
                List.of("Zombie"), new Random(7));
        Set<String> taken = Set.of("hairy zombie");
        for (int i = 0; i < 20; i++) {
            assertThat(generator.generate(taken, CANONICAL)).isEqualTo("Tiny Zombie");
        }
    }

    @Test
    void fallsBackToTheSmallestFreeNumericSuffixAfterCollisions() {
        QuickProfileNameGenerator generator = new QuickProfileNameGenerator(List.of("Hairy"), List.of("Zombie"),
                new Random(1));
        Set<String> taken = new HashSet<>();
        List<String> generated = Stream.generate(() -> {
            String name = generator.generate(taken, CANONICAL);
            taken.add(CANONICAL.apply(name));
            return name;
        }).limit(4).toList();
        assertThat(generated).containsExactly("Hairy Zombie", "Hairy Zombie 2", "Hairy Zombie 3", "Hairy Zombie 4");

        taken.remove("hairy zombie 3");
        assertThat(generator.generate(taken, CANONICAL)).isEqualTo("Hairy Zombie 3");
    }

    @Test
    void terminatesWhenNoSuffixedNameFitsAnyMore() {
        // A 16-grapheme base admits suffixes up to 999 within the 20-grapheme username limit.
        QuickProfileNameGenerator generator = new QuickProfileNameGenerator(List.of("Majestic"),
                List.of("Centaur"), new Random(3));
        Set<String> taken = new HashSet<>(List.of("majestic centaur"));
        for (int suffix = 2; suffix <= 999; suffix++) {
            taken.add("majestic centaur " + suffix);
        }
        assertThatThrownBy(() -> generator.generate(taken, CANONICAL)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsWordListsWithoutUsableCombinations() {
        assertThatThrownBy(() -> new QuickProfileNameGenerator(List.of("Extraordinarily"), List.of("Shapeshifter"),
                new Random(1))).isInstanceOf(IllegalStateException.class);
    }
}
