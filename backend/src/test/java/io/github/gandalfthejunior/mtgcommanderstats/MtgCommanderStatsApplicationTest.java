package io.github.gandalfthejunior.mtgcommanderstats;

import javax.sql.DataSource;

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
@Import(MtgCommanderStatsApplicationTest.DatabaseConfiguration.class)
class MtgCommanderStatsApplicationTest {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private Flyway flyway;

    @Test
    void applicationInitializesWithPostgresJpaAndFlyway() throws Exception {
        try (var connection = dataSource.getConnection()) {
            assertThat(connection.isValid(5)).isTrue();
            assertThat(connection.getMetaData().getDatabaseProductName()).isEqualTo("PostgreSQL");
            assertThat(connection.getMetaData().getDatabaseMajorVersion()).isEqualTo(18);
        }
        assertThat(entityManagerFactory.isOpen()).isTrue();
        try (var migrationConnection = flyway.getConfiguration().getDataSource().getConnection();
             var applicationConnection = dataSource.getConnection()) {
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
