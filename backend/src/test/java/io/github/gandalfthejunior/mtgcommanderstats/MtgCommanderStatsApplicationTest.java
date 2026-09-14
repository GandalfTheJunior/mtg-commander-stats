package io.github.gandalfthejunior.mtgcommanderstats;

import java.sql.Connection;
import javax.sql.DataSource;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplicationTest.DatabaseConfiguration;
import jakarta.persistence.EntityManagerFactory;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
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

        @Bean
        @ServiceConnection
        PostgreSQLContainer postgres() {
            return new PostgreSQLContainer("postgres:18");
        }
    }
}
