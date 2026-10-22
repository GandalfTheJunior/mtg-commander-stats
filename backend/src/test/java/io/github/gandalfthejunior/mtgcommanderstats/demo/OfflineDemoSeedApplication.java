package io.github.gandalfthejunior.mtgcommanderstats.demo;

import java.util.Arrays;
import java.util.List;

import io.github.gandalfthejunior.mtgcommanderstats.MtgCommanderStatsApplication;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Test-classpath-only entry point. The normal jar has no fixture switch/provider. */
public final class OfflineDemoSeedApplication {
    private OfflineDemoSeedApplication() {
    }

    public static void main(String[] args) {
        validateArguments(args);
        SpringApplication.run(new Class<?>[]{MtgCommanderStatsApplication.class, Fixtures.class},
                Arrays.copyOfRange(args, 1, args.length));
    }

    static void validateArguments(String[] args) {
        List<String> fixed = List.of("--allow-isolated-demo-seed",
                "--spring.config.location=classpath:/application.yaml",
                "--server.address=127.0.0.1", "--server.port=0");
        if (args.length != 7 || !Arrays.asList(args).subList(0, 4).equals(fixed)
                || !args[4].matches("--server.servlet.context-path=/demo-[a-f0-9]{32}")
                || !args[5].equals("--spring.datasource.url=jdbc:postgresql://127.0.0.1:5433/mtg_commander_demo")
                || !args[6].equals("--spring.datasource.username=mtg_commander_demo")) {
            throw new IllegalArgumentException("Only the isolated demo seed wrapper may start this test launcher.");
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    public static class Fixtures {
        @Bean
        @Primary
        PinnedScryfallClient pinnedScryfallClient() {
            return new PinnedScryfallClient();
        }
    }
}
