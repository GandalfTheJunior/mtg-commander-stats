package io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure;

import java.io.IOException;
import java.net.Authenticator;
import java.net.CookieHandler;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandler;
import java.net.http.HttpResponse.BodySubscriber;
import java.net.http.HttpResponse.PushPromiseHandler;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.Executor;
import java.util.concurrent.Flow;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

import static io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException.Kind.NOT_FOUND;
import static io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException.Kind.UNAVAILABLE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScryfallClientTest {
    private static final UUID CARD_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private final StubHttpClient http = new StubHttpClient();
    private final AtomicLong nanos = new AtomicLong();
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-22T00:00:00Z"), ZoneOffset.UTC);
    private ScryfallClient client;

    @BeforeEach
    void setUp() {
        ScryfallRequestGate gate = new ScryfallRequestGate(clock, nanos::get,
                duration -> nanos.addAndGet(duration.toNanos()));
        client = new ScryfallClient(http, JsonMapper.builder().build(), gate, Duration.ofMillis(30));
    }

    @Test
    void sendsDescriptiveHeadersAndExactPrintingToFixedHttpsApi() {
        stub(200, "{\"object\":\"card\"}", Map.of());
        assertThat(client.card(CARD_ID).get("object").asText()).isEqualTo("card");

        assertThat(http.requests).hasSize(1);
        HttpRequest request = http.requests.getFirst();
        assertThat(request.uri().toString()).isEqualTo("https://api.scryfall.com/cards/" + CARD_ID);
        assertThat(request.method()).isEqualTo("GET");
        assertThat(request.headers().firstValue("User-Agent")).contains(ScryfallClient.USER_AGENT);
        assertThat(request.headers().firstValue("Accept")).contains("application/json");
        assertThat(request.timeout()).contains(Duration.ofMillis(30));
    }

    @Test
    void encodesNameSearchAndUsesSeparateUniquePrintingDiscovery() {
        stub(200, "{\"object\":\"list\",\"data\":[]}", Map.of());
        client.search("name:\"Atraxa & friends\"");
        client.printings("oracleid:11111111-1111-4111-8111-111111111111");

        assertThat(http.requests).hasSize(2);
        assertThat(http.requests.getFirst().uri().toString())
                .isEqualTo("https://api.scryfall.com/cards/search?q=name%3A%22Atraxa+%26+friends%22"
                        + "&unique=cards&order=name&dir=asc");
        assertThat(http.requests.getFirst().uri().getRawQuery()).doesNotContain("include_multilingual");
        assertThat(http.requests.get(1).uri().toString())
                .isEqualTo("https://api.scryfall.com/cards/search?q=oracleid%3A11111111-1111-4111-8111-111111111111"
                        + "&unique=prints&order=released&dir=asc&include_multilingual=true");
        assertThat(nanos.get()).isEqualTo(ScryfallRequestGate.REQUEST_SPACING.toNanos());
    }

    @Test
    void acceptsOnlyValidatedApiSearchPagination() {
        stub(200, "{\"object\":\"list\",\"data\":[]}", Map.of());
        client.nextPage("https://api.scryfall.com/cards/search?q=atraxa&page=2");
        assertThat(http.requests).hasSize(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://api.scryfall.com/cards/search?page=2", "https://evil.test/cards/search",
            "https://api.scryfall.com@evil.test/cards/search", "https://user@api.scryfall.com/cards/search",
            "https://api.scryfall.com:443/cards/search", "https://api.scryfall.com/cards/search#fragment",
            "https://api.scryfall.com/cards/random", "https://api.scryfall.com/cards/%73earch",
            "//api.scryfall.com/cards/search", "not a URI"})
    void rejectsArbitraryOutboundPaginationTargets(String url) {
        assertFailure(() -> client.nextPage(url), UNAVAILABLE);
        assertThat(http.requests).isEmpty();
    }

    @Test
    void mapsNotFoundWithoutExposingUpstreamDetails() {
        stub(404, "{\"details\":\"private upstream information\"}", Map.of());
        assertFailure(() -> client.card(CARD_ID), NOT_FOUND);
    }

    @ParameterizedTest
    @ValueSource(ints = {301, 400, 403, 500, 502, 503})
    void neverFollowsRedirectsOrReturnsUncontrolledUpstreamErrors(int status) {
        stub(status, "upstream implementation detail", Map.of());
        assertFailure(() -> client.card(CARD_ID), UNAVAILABLE);
    }

    @Test
    void rateLimitHonorsRetryAfterWithoutRetryingOrSendingDuringCooldown() {
        stub(429, "rate limited", Map.of("Retry-After", List.of("60")));
        assertFailure(() -> client.card(CARD_ID), UNAVAILABLE);
        assertFailure(() -> client.card(CARD_ID), UNAVAILABLE);
        assertThat(http.requests).hasSize(1);
    }

    @Test
    void cancelsWholeResponseDeadlineIncludingAnIncompleteBody() {
        CompletableFuture<HttpResponse<byte[]>> pending = new CompletableFuture<>();
        http.pending = pending;
        assertFailure(() -> client.card(CARD_ID), UNAVAILABLE);
        assertThat(pending.isCancelled()).isTrue();
    }

    @Test
    void mapsNetworkFailureToControlledUnavailable() {
        http.pending = CompletableFuture.failedFuture(new IOException("network details"));
        assertFailure(() -> client.card(CARD_ID), UNAVAILABLE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"not json", "null", "[]", "\"card\"", ""})
    void rejectsMalformedOrUnexpectedJsonDocument(String body) {
        stub(200, body, Map.of());
        assertFailure(() -> client.card(CARD_ID), UNAVAILABLE);
    }

    @Test
    void boundsReceivedResponseBytesBeforeAccumulatingTheWholeBody() {
        BodySubscriber<byte[]> subscriber = ScryfallClient.boundedBody().apply(null);
        AtomicBoolean cancelled = new AtomicBoolean();
        subscriber.onSubscribe(new Flow.Subscription() {
            public void request(long amount) { }
            public void cancel() { cancelled.set(true); }
        });
        subscriber.onNext(List.of(ByteBuffer.allocate(ScryfallClient.MAX_RESPONSE_BYTES + 1)));
        assertThat(cancelled.get()).isTrue();
        assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().join())
                .isInstanceOf(CompletionException.class).hasCauseInstanceOf(IOException.class);
    }

    private void assertFailure(Runnable action, ScryfallClientException.Kind kind) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ScryfallClientException.class, exception -> {
            assertThat(exception.kind()).isEqualTo(kind);
            assertThat(exception.getMessage()).isEqualTo("Scryfall request could not be completed.");
        });
    }

    private void stub(int status, String body, Map<String, List<String>> headers) {
        HttpResponse<byte[]> response = new StubResponse(status, body.getBytes(StandardCharsets.UTF_8),
                HttpHeaders.of(headers, (name, value) -> true));
        http.pending = CompletableFuture.completedFuture(response);
    }

    private record StubResponse(int statusCode, byte[] body, HttpHeaders headers) implements HttpResponse<byte[]> {
        public HttpRequest request() { return HttpRequest.newBuilder(URI.create("https://api.scryfall.com")).build(); }
        public Optional<HttpResponse<byte[]>> previousResponse() { return Optional.empty(); }
        public Optional<SSLSession> sslSession() { return Optional.empty(); }
        public URI uri() { return request().uri(); }
        public HttpClient.Version version() { return HttpClient.Version.HTTP_2; }
    }

    private static final class StubHttpClient extends HttpClient {
        private final List<HttpRequest> requests = new ArrayList<>();
        private CompletableFuture<HttpResponse<byte[]>> pending;

        @Override
        @SuppressWarnings("unchecked")
        public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request, BodyHandler<T> handler) {
            requests.add(request);
            return (CompletableFuture<HttpResponse<T>>) (CompletableFuture<?>) pending;
        }

        @Override
        public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request, BodyHandler<T> handler,
                PushPromiseHandler<T> push) {
            return sendAsync(request, handler);
        }

        public Optional<CookieHandler> cookieHandler() { return Optional.empty(); }
        public Optional<Duration> connectTimeout() { return Optional.of(ScryfallClient.CONNECT_TIMEOUT); }
        public Redirect followRedirects() { return Redirect.NEVER; }
        public Optional<ProxySelector> proxy() { return Optional.empty(); }
        public SSLContext sslContext() { throw new UnsupportedOperationException(); }
        public SSLParameters sslParameters() { return new SSLParameters(); }
        public Optional<Authenticator> authenticator() { return Optional.empty(); }
        public Version version() { return Version.HTTP_2; }
        public Optional<Executor> executor() { return Optional.empty(); }
        public <T> HttpResponse<T> send(HttpRequest request, BodyHandler<T> handler) {
            throw new UnsupportedOperationException();
        }
    }
}
