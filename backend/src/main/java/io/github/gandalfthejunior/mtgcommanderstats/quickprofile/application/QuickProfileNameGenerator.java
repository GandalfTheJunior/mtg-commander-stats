package io.github.gandalfthejunior.mtgcommanderstats.quickprofile.application;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.UnaryOperator;
import java.util.random.RandomGenerator;
import java.util.regex.Pattern;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidNameException;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.NameRules;
import io.github.gandalfthejunior.mtgcommanderstats.user.domain.Username;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Draws playful "<adjective> <creature type>" names from curated resource word lists. */
@Component
public class QuickProfileNameGenerator {
    public static final String ADJECTIVES = "quick-profile-names/adjectives.txt";
    public static final String CREATURE_TYPES = "quick-profile-names/creature-types.txt";
    /** Leaves room for a numeric suffix within the username limit of 20. */
    public static final int MAX_BASE_LENGTH = 17;
    static final int RANDOM_ATTEMPTS = 5;
    private static final Pattern GRAPHEME = Pattern.compile("\\X");

    private final List<String> combinations;
    private final RandomGenerator random;

    @Autowired
    public QuickProfileNameGenerator() {
        this(readList(ADJECTIVES), readList(CREATURE_TYPES), new SecureRandom());
    }

    QuickProfileNameGenerator(List<String> adjectives, List<String> creatureTypes, RandomGenerator random) {
        this.combinations = usableCombinations(adjectives, creatureTypes);
        if (combinations.isEmpty()) {
            throw new IllegalStateException("The quick-profile word lists yield no usable names.");
        }
        this.random = random;
    }

    /**
     * Returns a name whose canonical form is not in {@code taken}. After a fixed number of random
     * collisions, the smallest free numeric suffix is appended, so generation always terminates.
     */
    public String generate(Set<String> taken, UnaryOperator<String> canonicalize) {
        Set<String> drawn = new LinkedHashSet<>();
        for (int attempt = 0; attempt < RANDOM_ATTEMPTS; attempt++) {
            String candidate = combinations.get(random.nextInt(combinations.size()));
            if (!taken.contains(canonicalize.apply(candidate))) {
                return candidate;
            }
            drawn.add(candidate);
        }
        for (String base : drawn) {
            for (int suffix = 2; fits(base + " " + suffix); suffix++) {
                String candidate = base + " " + suffix;
                if (!taken.contains(canonicalize.apply(candidate))) {
                    return candidate;
                }
            }
        }
        throw new IllegalStateException("No free quick-profile name is available.");
    }

    public static List<String> usableCombinations(List<String> adjectives, List<String> creatureTypes) {
        List<String> result = new ArrayList<>();
        for (String adjective : adjectives) {
            for (String creatureType : creatureTypes) {
                String candidate = adjective + " " + creatureType;
                if (graphemes(candidate) <= MAX_BASE_LENGTH && fits(candidate)) {
                    result.add(candidate);
                }
            }
        }
        return List.copyOf(result);
    }

    public static List<String> readList(String resource) {
        try (InputStream input = QuickProfileNameGenerator.class.getClassLoader().getResourceAsStream(resource)) {
            if (input == null) {
                throw new IllegalStateException("Missing quick-profile word list " + resource + ".");
            }
            return parse(input);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    static List<String> parse(InputStream input) throws IOException {
        List<String> entries = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            for (String line = reader.readLine(); line != null; line = reader.readLine()) {
                String entry = line.strip();
                if (!entry.isEmpty() && !entry.startsWith("#")) {
                    entries.add(entry);
                }
            }
        }
        return List.copyOf(entries);
    }

    public static int graphemes(String value) {
        return (int) GRAPHEME.matcher(value).results().count();
    }

    private static boolean fits(String candidate) {
        try {
            return new Username(candidate).value().equals(candidate);
        } catch (InvalidNameException exception) {
            return false;
        }
    }

    static boolean isValidEntry(String entry) {
        try {
            return NameRules.normalize(entry, Username.MAX_LENGTH).equals(entry) && !entry.contains(" ");
        } catch (InvalidNameException exception) {
            return false;
        }
    }
}
