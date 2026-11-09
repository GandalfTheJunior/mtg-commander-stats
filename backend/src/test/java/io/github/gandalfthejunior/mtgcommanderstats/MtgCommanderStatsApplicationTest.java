package io.github.gandalfthejunior.mtgcommanderstats;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.UUID;
import javax.sql.DataSource;

import com.zaxxer.hikari.HikariDataSource;
import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import jakarta.persistence.EntityManagerFactory;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Import(DatabaseConfiguration.class)
class MtgCommanderStatsApplicationTest {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private Flyway flyway;

    @Test
    void applicationInitializesWithPostgresJpaAndFlyway() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            assertThat(connection.isValid(5)).isTrue();
            assertThat(connection.getMetaData().getDatabaseProductName()).isEqualTo("PostgreSQL");
            assertThat(connection.getMetaData().getDatabaseMajorVersion()).isEqualTo(18);
        }
        assertThat(entityManagerFactory.isOpen()).isTrue();
        try (Connection migrationConnection = flyway.getConfiguration().getDataSource().getConnection();
             Connection applicationConnection = dataSource.getConnection()) {
            assertThat(migrationConnection.getMetaData().getURL())
                    .isEqualTo(applicationConnection.getMetaData().getURL());
        }
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class DatabaseConfiguration {
        // One PostgreSQL server per test JVM, rather than a container per cached Spring context.
        // Distinct contexts receive distinct databases so their test data remains isolated.
        // Spring caches up to 32 contexts. Four connections per context leave 22 of
        // PostgreSQL's 150 slots for database creation and other test connections.
        private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18")
                .withCommand("postgres", "-c", "max_connections=150");

        @Bean(destroyMethod = "close")
        HikariDataSource postgresDataSource() throws Exception {
            // A Spring context initializes its DataSource bean once. Synchronize database
            // creation so independently constructed contexts cannot race the container start.
            synchronized (DatabaseConfiguration.class) {
                if (!POSTGRES.isRunning()) {
                    POSTGRES.start();
                }
                String databaseName = "context_" + UUID.randomUUID().toString().replace("-", "");
                try (Connection admin = DriverManager.getConnection(
                        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
                     Statement statement = admin.createStatement()) {
                    statement.execute("CREATE DATABASE " + databaseName);
                }

                HikariDataSource dataSource = new HikariDataSource();
                dataSource.setJdbcUrl("jdbc:postgresql://" + POSTGRES.getHost()
                        + ":" + POSTGRES.getMappedPort(5432) + "/" + databaseName);
                dataSource.setUsername(POSTGRES.getUsername());
                dataSource.setPassword(POSTGRES.getPassword());
                dataSource.setDriverClassName("org.postgresql.Driver");
                dataSource.setMaximumPoolSize(4);
                dataSource.setMinimumIdle(0);
                return dataSource;
            }
        }
    }
}
