package io.github.gandalfthejunior.mtgcommanderstats;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;

import static org.assertj.core.api.Assertions.assertThat;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class InvitationLimitIsolationTest extends GameTestSupport {
    @Test
    @Order(1)
    void productionQuotaIsEnforcedWithinOneTest() throws Exception {
        Fixture f = fixture(); // Two joins already count against the same loopback peer.
        String code = groupService.createInvitation(f.owner().id(), f.groupId()).code();
        for (int i = 0; i < 118; i++) {
            assertThat(send(null, "GET", "/api/invitations/" + code, "").statusCode()).isEqualTo(200);
        }
        assertThat(send(null, "GET", "/api/invitations/" + code, "").statusCode()).isEqualTo(429);
    }

    @Test
    @Order(2)
    void nextTestStartsWithFreshQuotaInTheSameSpringContext() throws Exception {
        Fixture f = fixture();
        String code = groupService.createInvitation(f.owner().id(), f.groupId()).code();
        expect(null, "GET", "/api/invitations/" + code, "", 200);
    }
}
