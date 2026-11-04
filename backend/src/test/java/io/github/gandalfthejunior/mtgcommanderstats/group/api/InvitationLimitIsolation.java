package io.github.gandalfthejunior.mtgcommanderstats.group.api;

import org.springframework.test.context.TestContext;
import org.springframework.test.context.support.AbstractTestExecutionListener;

/** Test fixtures share a real loopback peer and Spring context, but must not share request quotas. */
public class InvitationLimitIsolation extends AbstractTestExecutionListener {
    @Override
    public void beforeTestMethod(TestContext context) {
        InvitationRequestLimit limit = context.getApplicationContext().getBean(InvitationRequestLimit.class);
        limit.clear();
    }
}
