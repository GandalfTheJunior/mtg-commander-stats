package io.github.gandalfthejunior.mtgcommanderstats.demo;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OfflineDemoShutdownTest {
    @Test
    void nodeStopsRealJavaThroughTheLaunchersPrivateStdinAndDrainsItsAcknowledgement() throws Exception {
        Path log = Files.createTempFile("demo-java-shutdown-", ".log");
        String executable = System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java";
        Path java = Path.of(System.getProperty("java.home"), "bin", executable);
        Process child = new ProcessBuilder("node", "tools/demo/java-shutdown-check.mjs", java.toString(),
                System.getProperty("surefire.test.class.path"))
                .directory(Path.of("..").toFile()).redirectErrorStream(true).redirectOutput(log.toFile()).start();
        try {
            assertThat(child.waitFor(90, TimeUnit.SECONDS)).as("Node/Java shutdown check must terminate").isTrue();
            assertThat(child.exitValue()).as("Java lifecycle regression: %s", Files.readString(log)).isZero();
        } finally {
            if (child.isAlive()) child.destroyForcibly().waitFor();
            Files.deleteIfExists(log);
        }
    }
}
