import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Development launcher preflight; never included in the production application. */
class CheckRuntimeResources {
    public static void main(String[] args) throws Exception {
        try (ZipFile jar = new ZipFile(args[0]);
                Stream<Path> sources = Files.list(Path.of(args[1]))) {
            String prefix = jar.getEntry("BOOT-INF/classes/application.yaml") == null ? "" : "BOOT-INF/classes/";
            List<Path> migrations = sources.filter(path -> path.getFileName().toString().matches("V[0-9]+__.*\\.sql"))
                    .sorted().toList();
            long packaged = jar.stream().filter(entry -> entry.getName().startsWith(prefix + "db/migration/")
                    && entry.getName().endsWith(".sql")).count();
            if (migrations.isEmpty() || packaged != migrations.size()) throw new IllegalStateException();
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (Path source : migrations) {
                ZipEntry entry = jar.getEntry(prefix + "db/migration/" + source.getFileName());
                if (entry == null) throw new IllegalStateException();
                try (InputStream stream = jar.getInputStream(entry)) {
                    byte[] bytes = stream.readAllBytes();
                    if (!Arrays.equals(bytes, Files.readAllBytes(source))) throw new IllegalStateException();
                    digest.update(bytes);
                }
            }
            ZipEntry javaMigration = jar.getEntry(prefix + "db/migration/V16__validate_names.class");
            if (javaMigration == null) throw new IllegalStateException();
            try (InputStream stream = jar.getInputStream(javaMigration)) {
                byte[] bytes = stream.readAllBytes();
                if (bytes.length < 4 || bytes[0] != (byte) 0xCA || bytes[1] != (byte) 0xFE
                        || bytes[2] != (byte) 0xBA || bytes[3] != (byte) 0xBE) throw new IllegalStateException();
                digest.update(bytes);
            }
            System.out.println("runtime-resources: readable=" + (packaged + 1) + " sha256=" + HexFormat.of().formatHex(digest.digest()));
        } catch (Exception failure) {
            // No paths, environment values, archive contents or exception messages.
            System.err.println("runtime-resources: verification-failed");
            System.exit(1);
        }
    }
}
