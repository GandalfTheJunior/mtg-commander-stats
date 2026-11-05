package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Regular Commander selection policy; never applies retroactively to saved snapshots. */
public final class CompanionRules {
    private static final Pattern COMPANION_ABILITY = Pattern.compile("(?m)^Companion[ \t]*[—–]\\s*\\S");
    // Reviewed against Wizards' 2026-02-09 announcement and the fixed 100-card Commander rule.
    // General Scryfall format legality does not represent Companion-only bans. Review this
    // policy against authoritative rule changes before changing it; see docs/product/decks-api.md.
    private static final Map<String, String> RESTRICTIONS = Map.of(
            "158a6225-a246-4fd6-aa57-0df8067b4383", "Lutri, the Spellchaser is banned as a Companion in Commander.",
            "e15504a7-2b67-4185-b916-172145f10b19", "Yorion, Sky Nomad requires 20 extra cards and cannot be a Companion in a fixed-size Commander deck.");

    private CompanionRules() {
    }

    public static boolean hasMechanic(List<String> keywords, String oracleText) {
        return keywords.contains("Companion") || COMPANION_ABILITY.matcher(oracleText).find();
    }

    public static String rejection(GameplayCard card) {
        if (!card.hasCompanionMechanic()) {
            return "Choose a card with the genuine Companion mechanic; Doctor's companion is a Commander pairing role.";
        }
        if (!"legal".equals(card.commanderLegality())) {
            return "Choose a currently Commander-legal Companion.";
        }
        return RESTRICTIONS.get(card.oracleId());
    }
}
