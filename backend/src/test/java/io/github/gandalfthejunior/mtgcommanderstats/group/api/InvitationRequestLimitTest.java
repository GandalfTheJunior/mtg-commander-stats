package io.github.gandalfthejunior.mtgcommanderstats.group.api;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InvitationRequestLimitTest {
    @Test
    void limitsPeersIndependentlyAndResetsAtMinuteBoundary() {
        Clock clock = mock(Clock.class);
        when(clock.millis()).thenReturn(0L);
        InvitationRequestLimit limit = new InvitationRequestLimit(clock);
        for (int i = 0; i < 120; i++) {
            assertThat(limit.admit("first")).isTrue();
        }
        assertThat(limit.admit("first")).isFalse();
        assertThat(limit.admit("second")).isTrue();
        when(clock.millis()).thenReturn(59_999L);
        assertThat(limit.admit("first")).isFalse();
        when(clock.millis()).thenReturn(60_000L);
        assertThat(limit.admit("first")).isTrue();
    }

    @Test
    void fullTableEvictsOldestWindowAndAdmitsNewPeersWithoutResettingOtherQuotas() {
        Clock clock = mock(Clock.class);
        when(clock.millis()).thenReturn(0L);
        InvitationRequestLimit limit = new InvitationRequestLimit(clock);
        for (int i = 0; i < 120; i++) {
            assertThat(limit.admit("oldest")).isTrue();
        }
        when(clock.millis()).thenReturn(1L);
        for (int i = 0; i < 4095; i++) {
            assertThat(limit.admit("peer" + i)).isTrue();
        }
        for (int i = 1; i < 120; i++) {
            assertThat(limit.admit("peer4094")).isTrue();
        }
        assertThat(limit.admit("overflow")).isTrue();
        assertThat(limit.admit("peer4094")).isFalse();
        assertThat(limit.admit("oldest")).isTrue();
        assertThat(((java.util.Map<?, ?>) org.springframework.test.util.ReflectionTestUtils.getField(limit, "peers")))
                .hasSize(4096);
    }

    @Test
    void ipv6AddressesInSame64BitNetworkShareQuotaButOtherNetworksAreIndependent() {
        InvitationRequestLimit limit = new InvitationRequestLimit(Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
        for (int i = 0; i < 120; i++) {
            assertThat(limit.admit("2001:db8:1234:5678::" + Integer.toHexString(i))).isTrue();
        }
        assertThat(limit.admit("2001:0db8:1234:5678:ffff:ffff:ffff:ffff")).isFalse();
        assertThat(limit.admit("2001:db8:1234:5679::1")).isTrue();
        assertThat(limit.admit("192.0.2.1")).isTrue();
        assertThat(limit.admit("192.0.2.2")).isTrue();
    }

    @Test
    void throttledRequestsReturnGenericNonCacheable429WithoutEchoingToken() throws Exception {
        InvitationRequestLimit limit = new InvitationRequestLimit(Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
        for (int i = 0; i < 120; i++) {
            assertThat(limit.admit("192.0.2.1")).isTrue();
        }
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/invitations/secret");
        request.setServletPath("/api/invitations/secret");
        request.setRemoteAddr("192.0.2.1");
        MockHttpServletResponse response = new MockHttpServletResponse();
        limit.doFilter(request, response, (req, res) -> { throw new AssertionError("Rejected request reached controller"); });
        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(response.getHeader("Retry-After")).isEqualTo("60");
        assertThat(response.getContentAsString()).doesNotContain("secret");
    }
}
