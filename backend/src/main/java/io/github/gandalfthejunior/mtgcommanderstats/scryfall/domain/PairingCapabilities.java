package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Narrow recognition of Commander pairing abilities, using authoritative gameplay rules. */
public record PairingCapabilities(List<String> roles, List<String> partnerWith, List<String> variants) {
    public static final PairingCapabilities NONE = new PairingCapabilities(List.of(), List.of(), List.of());
    public static final String PARTNER = "PARTNER";
    public static final String CHOOSE_BACKGROUND = "CHOOSE_BACKGROUND";
    public static final String BACKGROUND = "BACKGROUND";
    public static final String DOCTOR = "DOCTOR";
    public static final String COMPANION = "COMPANION";
    private static final Pattern WITH = Pattern.compile("(?im)^Partner with ([^\\n(]+?)(?:\\s*\\(|\\s*$)");
    private static final Pattern VARIANT = Pattern.compile("(?im)^Partner\\s*[—–]\\s*([^\\n(.]+)");
    private static final Pattern ORDINARY = Pattern.compile("(?im)^Partner(?:\\s*\\(|\\s*$)");

    public PairingCapabilities {
        roles = List.copyOf(roles);
        partnerWith = List.copyOf(partnerWith);
        variants = List.copyOf(variants);
    }

    public boolean supportsPair() {
        return !roles.isEmpty() || !partnerWith.isEmpty() || !variants.isEmpty();
    }

    public static PairingCapabilities classify(String typeLine, List<String> keywords, String oracleText) {
        // Ordinary transform/modal back faces never confer a second gameplay role on the front.
        String frontType = typeLine.split(" // ", 2)[0];
        String frontText = oracleText.split(" // ", 2)[0].replace("\r", "").strip();
        Set<String> roles = new LinkedHashSet<>();
        Set<String> with = new LinkedHashSet<>();
        Set<String> variants = new LinkedHashSet<>();
        Matcher names = WITH.matcher(frontText);
        while (names.find()) {
            with.add(normalize(names.group(1)));
        }
        Matcher labels = VARIANT.matcher(frontText);
        while (labels.find()) {
            variants.add(normalize(labels.group(1)));
        }
        for (String keyword : keywords) {
            Matcher variant = VARIANT.matcher(keyword);
            if (variant.find()) {
                variants.add(normalize(variant.group(1)));
            }
        }
        if (ability(frontText, "Friends forever") || keywords.contains("Friends forever")) {
            variants.add("friends forever");
        }
        // Scryfall's broad Partner keyword can also describe specific/unknown variants.
        // Require the ordinary ability itself rather than guessing from that keyword.
        if (ORDINARY.matcher(frontText).find()) {
            roles.add(PARTNER);
        }
        String[] types = frontType.split("[—–]", 2);
        boolean legendary = word(types[0], "Legendary");
        boolean creature = word(types[0], "Creature");
        if (legendary && word(types[0], "Enchantment") && types.length == 2 && word(types[1], "Background")) {
            roles.add(BACKGROUND);
        }
        if (legendary && creature) {
            if (ability(frontText, "Choose a Background")) {
                roles.add(CHOOSE_BACKGROUND);
            }
            if (ability(frontText, "Doctor's companion")) {
                roles.add(COMPANION);
            }
            if (types.length == 2 && List.of("time lord doctor", "doctor time lord").contains(normalize(types[1]))) {
                roles.add(DOCTOR);
            }
        }
        return new PairingCapabilities(new ArrayList<>(roles), new ArrayList<>(with), new ArrayList<>(variants));
    }

    public static boolean compatible(GameplayCard first, GameplayCard second) {
        if (first.oracleId() == null || second.oracleId() == null || first.oracleId().equals(second.oracleId())) {
            return false;
        }
        PairingCapabilities a = first.pairing();
        PairingCapabilities b = second.pairing();
        return (a.roles.contains(PARTNER) && b.roles.contains(PARTNER))
                || matches(a, b, CHOOSE_BACKGROUND, BACKGROUND)
                || matches(a, b, DOCTOR, COMPANION)
                || (a.partnerWith.contains(normalize(second.name())) && b.partnerWith.contains(normalize(first.name())))
                || a.variants.stream().anyMatch(b.variants::contains);
    }

    private static boolean matches(PairingCapabilities a, PairingCapabilities b, String left, String right) {
        return (a.roles.contains(left) && b.roles.contains(right)) || (a.roles.contains(right) && b.roles.contains(left));
    }

    private static boolean ability(String text, String ability) {
        return Pattern.compile("(?im)^" + Pattern.quote(ability) + "(?:\\s*\\(|\\s*$)").matcher(text).find();
    }

    private static boolean word(String text, String word) {
        return Pattern.compile("\\b" + word + "\\b").matcher(text).find();
    }

    private static String normalize(String value) {
        return value.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }
}
