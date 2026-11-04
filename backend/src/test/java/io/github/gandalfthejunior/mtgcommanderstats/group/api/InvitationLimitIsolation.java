package io.github.gandalfthejunior.mtgcommanderstats.group.api;

import java.util.Map;

import org.springframework.test.context.TestContext;
import org.springframework.test.context.support.AbstractTestExecutionListener;
import org.springframework.test.util.ReflectionTestUtils;

/** Test fixtures share a real loopback peer and Spring context, but must not share request quotas. */
public class InvitationLimitIsolation extends AbstractTestExecutionListener {
    @Override
    public void beforeTestMethod(TestContext context) {
        InvitationRequestLimit limit = context.getApplicationContext().getBean(InvitationRequestLimit.class);
        synchronized (limit) {
            Map<?, ?> peers = (Map<?, ?>) ReflectionTestUtils.getField(limit, "peers");
            if (peers == null) {
                throw new IllegalStateException("Invitation limiter state was not found.");
            }
            peers.clear();
        }
    }
}
