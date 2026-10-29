package io.github.gandalfthejunior.mtgcommanderstats;

import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Enumeration;
import java.util.List;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.callback.Callback;
import org.flywaydb.core.api.callback.Context;
import org.flywaydb.core.api.callback.Event;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Controlled resource faults explain possible mechanisms, not historical Codespaces causation. */
class FlywayResourceAvailabilityTest {
    @TempDir
    private Path temp;

    @Test
    void distinguishesAbsentResourcesFromDiscoveredButUnreadableResources() throws Exception {
        Path classes = Files.createDirectory(temp.resolve("classes"));
        try (PostgreSQLContainer database = new PostgreSQLContainer("postgres:18");
                URLClassLoader loader = migrationsLoader(classes)) {
            database.start();
            Flyway absent = configure(database, loader);
            assertThat(absent.info().all()).isEmpty();
            assertThat(absent.migrate().migrationsExecuted).isZero();
            copyMigrations(classes);
            Flyway discovered = Flyway.configure(loader).dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                    .callbacks(new Callback() {
                        public boolean supports(Event event, Context context) { return event == Event.AFTER_VALIDATE; }
                        public boolean canHandleInTransaction(Event event, Context context) { return true; }
                        public String getCallbackName() { return "controlled-resource-removal"; }
                        public void handle(Event event, Context context) {
                            try { Files.delete(classes.resolve("db/migration/V2__use_email_for_authentication.sql")); }
                            catch (IOException failure) { throw new IllegalStateException(failure); }
                        }
                    }).load();
            assertThat(discovered.info().pending()).hasSize(8);
            assertThatThrownBy(discovered::migrate).hasStackTraceContaining("Unable to obtain inputstream for resource");
        }
    }

    @Test
    void archiveClasspathFindsAndReadsAllMigrationsAfterBuildDirectoryDisappears() throws Exception {
        Path classes = Files.createDirectory(temp.resolve("classes"));
        List<Path> migrations = copyMigrations(classes);
        Path archive = temp.resolve("application.jar");
        try (JarOutputStream jar = new JarOutputStream(Files.newOutputStream(archive))) {
            jar.putNextEntry(new JarEntry("db/migration/"));
            jar.closeEntry();
            for (Path migration : migrations) {
                jar.putNextEntry(new JarEntry("db/migration/" + migration.getFileName()));
                Files.copy(migration, jar);
                jar.closeEntry();
                Files.delete(migration);
            }
        }
        try (PostgreSQLContainer database = new PostgreSQLContainer("postgres:18");
                URLClassLoader loader = migrationsLoader(archive)) {
            database.start();
            Flyway flyway = configure(database, loader);
            assertThat(flyway.info().pending()).hasSize(8);
            assertThat(flyway.migrate().migrationsExecuted).isEqualTo(8);
            assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
            assertThat(flyway.info().applied()).hasSize(8);
        }
    }

    private Flyway configure(PostgreSQLContainer database, ClassLoader loader) {
        return Flyway.configure(loader).dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword()).load();
    }

    private List<Path> copyMigrations(Path classes) throws IOException {
        Path destination = Files.createDirectories(classes.resolve("db/migration"));
        try (java.util.stream.Stream<Path> files = Files.list(Path.of("src/main/resources/db/migration"))) {
            List<Path> migrations = files.sorted().toList();
            for (Path migration : migrations) Files.copy(migration, destination.resolve(migration.getFileName()));
            return migrations.stream().map(path -> destination.resolve(path.getFileName())).toList();
        }
    }

    private URLClassLoader migrationsLoader(Path path) throws IOException {
        return new URLClassLoader(new URL[]{path.toUri().toURL()}, getClass().getClassLoader()) {
            @Override
            public Enumeration<URL> getResources(String name) throws IOException {
                return name.startsWith("db/migration") ? findResources(name) : super.getResources(name);
            }
            @Override
            public URL getResource(String name) {
                return name.startsWith("db/migration") ? findResource(name) : super.getResource(name);
            }
        };
    }
}
