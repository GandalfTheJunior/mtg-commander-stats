package io.github.gandalfthejunior.mtgcommanderstats.demo;

import java.util.List;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.Deck;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckCommander;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.DeckLifecycleConflictException;
import io.github.gandalfthejunior.mtgcommanderstats.deck.domain.InvalidCommanderException;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.ResolvedCommander;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.ScryfallLookup;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CommanderSelectionRef;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.PairingCapabilities;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.ScryfallNormalizer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PinnedCommanderFixturesTest {
    private final PinnedScryfallClient client = new PinnedScryfallClient();
    private final ScryfallNormalizer normalizer = new ScryfallNormalizer();
    private final ScryfallLookup lookup = new ScryfallLookup(client, normalizer);

    @ParameterizedTest
    @ValueSource(strings = {"c78c2713-39e7-4a6e-a132-027099a89665", "25564fba-5765-457b-8dd3-f26b877221b8", "9a1ee042-6713-4e9e-9901-9b94d99d33f1"})
    void originalOracleWordingRequiresEveryValidChosenColorAndLocksAfterFirstUse(String id) {
        ResolvedCommander resolved = lookup.resolveCommanderOnline(new CommanderSelectionRef(UUID.fromString(id), null));
        assertThat(resolved.gameplay().requiresChosenColor()).isTrue();
        assertThat(client.requests()).isEqualTo(1); // No separate request for Oracle text.
        for (String color : List.of("W", "U", "B", "R", "G")) {
            DeckCommander commander = new DeckCommander(1, resolved, color);
            assertThat(commander.effectiveColorIdentity().symbols()).containsExactly(color);
            Deck deck = new Deck(UUID.randomUUID(), "Pinned Commander", List.of(commander));
            deck.markUsed();
            String changed = color.equals("R") ? "U" : "R";
            assertThatThrownBy(() -> deck.replaceCommanders(List.of(new DeckCommander(1, resolved, changed))))
                    .isInstanceOf(DeckLifecycleConflictException.class);
        }
        assertThatThrownBy(() -> new DeckCommander(1, resolved, null)).isInstanceOf(InvalidCommanderException.class);
        for (String invalid : List.of("", "C", "WU", "r")) {
            assertThatThrownBy(() -> new DeckCommander(1, resolved, invalid)).isInstanceOf(InvalidCommanderException.class);
        }
    }

    @Test
    void unseenNamesAndFaceSpecificTextUseTheAbilityRatherThanAnAllowlist() {
        ObjectNode unknown = (ObjectNode) client.card(UUID.fromString("c78c2713-39e7-4a6e-a132-027099a89665"));
        String name = "Dr. Uncharted Chromatic Explorer";
        unknown.put("id", "00000106-0000-4000-8000-000000000001");
        unknown.put("oracle_id", "00000106-0000-4000-8000-000000000002");
        unknown.put("name", name);
        unknown.put("oracle_text", "If " + name + " is your commander, choose a color before the game begins. " + name + " is the chosen color.\nPartner");
        assertThat(normalizer.normalize(unknown).gameplayCards().getFirst().requiresChosenColor()).isTrue();
        ObjectNode faceSpecific = unknown.deepCopy();
        faceSpecific.remove("oracle_text");
        faceSpecific.putArray("card_faces").addObject().put("oracle_text", unknown.path("oracle_text").asText());
        assertThat(normalizer.normalize(faceSpecific).gameplayCards().getFirst().requiresChosenColor()).isTrue();
        unknown.put("oracle_text", "As this creature enters, choose a color. It is the chosen color.");
        assertThat(normalizer.normalize(unknown).requiresChosenColor()).isFalse();
        ((ObjectNode) faceSpecific.path("card_faces").get(0)).put("oracle_text", "Choose a color. Draw a card.");
        assertThat(normalizer.normalize(faceSpecific).requiresChosenColor()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"055a00a2-0df2-4f49-ac51-e33dfaf7ee85", "824b2d73-2151-4e5e-9f05-8f63e2bdcaa9"})
    void ordinaryAndColorlessCommandersRejectSpuriousChoice(String id) {
        ResolvedCommander resolved = lookup.resolveCommanderOnline(new CommanderSelectionRef(UUID.fromString(id), null));
        assertThat(resolved.gameplay().requiresChosenColor()).isFalse();
        assertThat(new DeckCommander(1, resolved, null).effectiveColorIdentity().symbols()).isEqualTo(resolved.gameplay().colorIdentity());
        assertThatThrownBy(() -> new DeckCommander(1, resolved, "U")).isInstanceOf(InvalidCommanderException.class);
    }

    @Test
    void realPairingMetadataRejectsLegalButIncompatiblePairs() {
        assertThat(PairingCapabilities.compatible(resolve("c78c2713-39e7-4a6e-a132-027099a89665").gameplay(),
                resolve("745d297d-4bb4-40cf-bb9c-99dac04e5069").gameplay())).isTrue();
        assertThat(PairingCapabilities.compatible(resolve("c78c2713-39e7-4a6e-a132-027099a89665").gameplay(),
                resolve("824b2d73-2151-4e5e-9f05-8f63e2bdcaa9").gameplay())).isFalse();
        assertThat(PairingCapabilities.compatible(resolve("5a7241f5-4d69-47fe-b037-95037008184c").gameplay(),
                resolve("a09ffd51-8ea4-40a6-b64e-58f3acfee533").gameplay())).isFalse();
    }

    @Test
    void unexpectedCardSearchArtworkAndPaginationFailClosed() {
        assertThatThrownBy(() -> client.card(UUID.randomUUID())).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> client.search("name:unreviewed")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> client.printings("oracleid:unreviewed")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> client.nextPage("https://api.scryfall.com/cards/search?page=2")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void launcherRejectsNonDemoTargetsAndAdditionalOverridesBeforeSpringStarts() {
        String[] args = {"--allow-isolated-demo-seed", "--spring.config.location=classpath:/application.yaml",
                "--server.address=127.0.0.1", "--server.port=0", "--server.servlet.context-path=/demo-" + "a".repeat(32),
                "--spring.datasource.url=jdbc:postgresql://127.0.0.1:5433/mtg_commander_demo", "--spring.datasource.username=mtg_commander_demo"};
        OfflineDemoSeedApplication.validateArguments(args);
        for (int index = 0; index < args.length; index++) {
            String[] invalid = args.clone();
            invalid[index] = "--spring.datasource.url=jdbc:postgresql://localhost:5432/shared";
            assertThatThrownBy(() -> OfflineDemoSeedApplication.validateArguments(invalid)).isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> OfflineDemoSeedApplication.validateArguments(new String[0])).isInstanceOf(IllegalArgumentException.class);
        String[] extra = java.util.Arrays.copyOf(args, args.length + 1);
        extra[args.length] = "--spring.profiles.active=production";
        assertThatThrownBy(() -> OfflineDemoSeedApplication.validateArguments(extra)).isInstanceOf(IllegalArgumentException.class);
    }

    private ResolvedCommander resolve(String id) {
        return lookup.resolveCommanderOnline(new CommanderSelectionRef(UUID.fromString(id), null));
    }
}
