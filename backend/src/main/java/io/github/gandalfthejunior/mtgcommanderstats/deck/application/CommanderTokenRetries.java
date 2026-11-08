package io.github.gandalfthejunior.mtgcommanderstats.deck.application;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.application.RelatedTokenLookup;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.RelatedToken;
import io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/** Durable leased work, serialized with every existing deck mutation at claim and publication. */
@Service
public class CommanderTokenRetries {
    private static final Logger LOG = LoggerFactory.getLogger(CommanderTokenRetries.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final RelatedTokenLookup lookup;
    private final ScryfallClient client;

    public CommanderTokenRetries(JdbcTemplate jdbc, TransactionTemplate transactions,
            RelatedTokenLookup lookup, ScryfallClient client) {
        this.jdbc = jdbc;
        this.transactions = transactions;
        this.lookup = lookup;
        this.client = client;
    }

    @Configuration(proxyBeanMethods = false)
    @EnableScheduling
    @ConditionalOnProperty(name = "app.tokens.scheduling.enabled", havingValue = "true", matchIfMissing = true)
    static class Scheduling { }

    /** One job per tick and one sequential provider request at a time within each job. */
    @Scheduled(fixedDelayString = "${app.tokens.retry-delay-ms:15000}", initialDelayString = "${app.tokens.retry-delay-ms:15000}")
    public void retryDue() {
        Job job = claim();
        if (job == null) {
            return;
        }
        List<RelatedToken> tokens;
        try {
            tokens = lookup.resolve(job.printing());
        } catch (RuntimeException exception) {
            fail(job);
            return;
        }
        complete(job, tokens);
    }

    public Job claim() {
        return transactions.execute(status -> {
            List<Job> jobs = jdbc.query("""
                    SELECT c.deck_id, c.position, c.scryfall_card_id, c.token_generation, c.token_attempts
                    FROM deck_commanders c JOIN decks d ON d.id = c.deck_id
                    WHERE c.related_tokens IS NULL AND c.token_due_at <= CURRENT_TIMESTAMP
                    ORDER BY c.token_due_at, c.deck_id, c.position
                    LIMIT 1 FOR UPDATE OF d SKIP LOCKED
                    """, (row, index) -> new Job(row.getObject(1, UUID.class), row.getInt(2),
                            row.getObject(3, UUID.class), row.getObject(4, UUID.class), UUID.randomUUID(), row.getInt(5)));
            if (jobs.isEmpty()) {
                return null;
            }
            Job job = jobs.getFirst();
            jdbc.update("""
                    UPDATE deck_commanders SET token_claim = ?, token_due_at = CURRENT_TIMESTAMP + INTERVAL '2 minutes'
                    WHERE deck_id = ? AND position = ?
                    """, job.claim(), job.deck(), job.position());
            return job;
        });
    }

    public void complete(Job job, List<RelatedToken> tokens) {
        transactions.executeWithoutResult(status -> {
            if (jdbc.queryForList("SELECT id FROM decks WHERE id = ? FOR UPDATE", UUID.class, job.deck()).isEmpty()) {
                return;
            }
            jdbc.update("""
                    UPDATE deck_commanders SET related_tokens = ?, token_due_at = NULL,
                        token_claim = NULL, token_last_failure = NULL
                    WHERE deck_id = ? AND position = ? AND scryfall_card_id = ?
                        AND token_generation = ? AND token_claim = ? AND related_tokens IS NULL
                    """, JSON.writeValueAsString(tokens), job.deck(), job.position(), job.printing(), job.generation(), job.claim());
        });
    }

    public void fail(Job job) {
        long seconds = Math.min(86400L, 60L << Math.min(job.attempts(), 11));
        Instant due = Instant.now().plusSeconds(seconds + ThreadLocalRandom.current().nextLong(seconds / 4 + 1));
        Instant cooldown = client.cooldownUntil();
        if (cooldown != null && cooldown.isAfter(due)) {
            // PostgreSQL/JDBC representable even for an overflowing Retry-After value.
            due = cooldown.isAfter(Instant.parse("9999-01-01T00:00:00Z"))
                    ? Instant.parse("9999-01-01T00:00:00Z") : cooldown;
        }
        Instant retryAt = due;
        transactions.executeWithoutResult(status -> {
            if (jdbc.queryForList("SELECT id FROM decks WHERE id = ? FOR UPDATE", UUID.class, job.deck()).isEmpty()) {
                return;
            }
            int changed = jdbc.update("""
                    UPDATE deck_commanders SET token_due_at = ?, token_attempts = LEAST(token_attempts + 1, 1000000),
                        token_claim = NULL, token_last_failure = 'TOKEN_METADATA_UNAVAILABLE'
                    WHERE deck_id = ? AND position = ? AND scryfall_card_id = ?
                        AND token_generation = ? AND token_claim = ? AND related_tokens IS NULL
                    """, Timestamp.from(retryAt), job.deck(), job.position(), job.printing(), job.generation(), job.claim());
            if (changed > 0) {
                LOG.warn("Commander token enrichment pending; attempt={}, retryAt={}", job.attempts() + 1, retryAt);
            }
        });
    }

    public record Job(UUID deck, int position, UUID printing, UUID generation, UUID claim, int attempts) { }
}
