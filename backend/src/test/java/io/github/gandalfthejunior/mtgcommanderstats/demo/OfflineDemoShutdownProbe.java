package io.github.gandalfthejunior.mtgcommanderstats.demo;

import java.util.UUID;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

/** Real Java/Spring lifecycle probe without PostgreSQL; never packaged in the normal jar. */
public final class OfflineDemoShutdownProbe {
    private OfflineDemoShutdownProbe() {
    }

    public static void main(String[] args) throws Exception {
        AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext();
        context.registerBean(PinnedScryfallClient.class);
        context.registerBean("closeWitness", DisposableBean.class, () -> () -> System.out.println("Spring context destroyed."));
        context.refresh();
        if (args.length == 1 && args[0].equals("unexpected")) {
            try {
                context.getBean(PinnedScryfallClient.class).card(UUID.fromString("00000106-0000-4000-8000-000000000099"));
            } catch (IllegalStateException expected) {
                // An HTTP controller could also translate this error; it still poisons completion.
            }
        }
        System.out.println("Java shutdown probe ready.");
        OfflineDemoSeedApplication.awaitShutdown(context, System.in);
    }
}
