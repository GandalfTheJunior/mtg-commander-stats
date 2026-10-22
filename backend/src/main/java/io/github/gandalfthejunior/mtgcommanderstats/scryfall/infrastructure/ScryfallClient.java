package io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandler;
import java.net.http.HttpResponse.BodySubscriber;
import java.net.http.HttpResponse.BodySubscribers;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException.Kind.NOT_FOUND;
import static io.github.gandalfthejunior.mtgcommanderstats.scryfall.infrastructure.ScryfallClientException.Kind.UNAVAILABLE;

@Component
public class ScryfallClient {
    static final String API_HOST = "api.scryfall.com";
    static final String USER_AGENT = "MTG-Commander-Stats/1.0 (+https://github.com/GandalfTheJunior/mtg-commander-stats)";
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
    static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

    private final HttpClient http;
    private final JsonMapper json;
    private final ScryfallRequestGate gate;
    private final Duration requestTimeout;

    public ScryfallClient() {
        this(HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER).build(), JsonMapper.builder().build(),
                new ScryfallRequestGate(), REQUEST_TIMEOUT);
    }

    ScryfallClient(HttpClient http, JsonMapper json, ScryfallRequestGate gate, Duration requestTimeout) {
        this.http = http;
        this.json = json;
        this.gate = gate;
        this.requestTimeout = requestTimeout;
    }

    public JsonNode card(UUID cardId) {
        return get(URI.create("https://" + API_HOST + "/cards/" + cardId));
    }

    public JsonNode search(String query) {
        return search(query, "cards", "name", false);
    }

    public JsonNode printings(String query) {
        return search(query, "prints", "released", true);
    }

    private JsonNode search(String query, String unique, String order, boolean artworkDiscovery) {
        String encoded = URLEncoder.encode(query, StandardCharsets.UTF_8);
        return get(URI.create("https://" + API_HOST + "/cards/search?q=" + encoded
                + "&unique=" + unique + "&order=" + order + "&dir=asc"
                + (artworkDiscovery ? "&include_multilingual=true&include_variations=true" : "")));
    }

    /** Pagination targets are authoritative metadata, but still restricted to the fixed API route. */
    public JsonNode nextPage(String url) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new ScryfallClientException(UNAVAILABLE);
        }
        if (!"https".equals(uri.getScheme()) || !API_HOST.equals(uri.getHost())
                || uri.getRawUserInfo() != null || uri.getPort() != -1 || uri.getRawFragment() != null
                || !"/cards/search".equals(uri.getRawPath())) {
            throw new ScryfallClientException(UNAVAILABLE);
        }
        return get(uri);
    }

    private JsonNode get(URI uri) {
        CompletableFuture<HttpResponse<byte[]>> pending = null;
        try {
            gate.awaitRequest();
            HttpRequest request = HttpRequest.newBuilder(uri).timeout(requestTimeout)
                    .header("User-Agent", USER_AGENT).header("Accept", MediaType.APPLICATION_JSON_VALUE).GET().build();
            pending = http.sendAsync(request, boundedBody());
            HttpResponse<byte[]> response = pending.get(requestTimeout.toMillis(), TimeUnit.MILLISECONDS);
            if (response.statusCode() == HttpStatus.TOO_MANY_REQUESTS.value()) {
                gate.rateLimited(response.headers().firstValue("Retry-After").orElse(null));
                throw new ScryfallClientException(UNAVAILABLE);
            }
            if (response.statusCode() == HttpStatus.NOT_FOUND.value()) {
                throw new ScryfallClientException(NOT_FOUND);
            }
            if (response.statusCode() != HttpStatus.OK.value() || response.body() == null
                    || response.body().length > MAX_RESPONSE_BYTES) {
                throw new ScryfallClientException(UNAVAILABLE);
            }
            JsonNode document = json.readTree(response.body());
            if (document == null || !document.isObject()) {
                throw new ScryfallClientException(UNAVAILABLE);
            }
            return document;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ScryfallClientException(UNAVAILABLE);
        } catch (ExecutionException | TimeoutException | JacksonException exception) {
            throw new ScryfallClientException(UNAVAILABLE);
        } finally {
            if (pending != null && !pending.isDone()) {
                pending.cancel(true);
            }
        }
    }

    static BodyHandler<byte[]> boundedBody() {
        return response -> new BoundedBodySubscriber();
    }

    private static final class BoundedBodySubscriber implements BodySubscriber<byte[]> {
        private final BodySubscriber<byte[]> delegate = BodySubscribers.ofByteArray();
        private Flow.Subscription subscription;
        private long received;

        @Override
        public CompletionStage<byte[]> getBody() {
            return delegate.getBody();
        }

        @Override
        public void onSubscribe(Flow.Subscription value) {
            subscription = value;
            delegate.onSubscribe(value);
        }

        @Override
        public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) {
                received += buffer.remaining();
            }
            if (received > MAX_RESPONSE_BYTES) {
                subscription.cancel();
                delegate.onError(new IOException("Scryfall response exceeded its size limit."));
                return;
            }
            delegate.onNext(buffers);
        }

        @Override
        public void onError(Throwable error) {
            delegate.onError(error);
        }

        @Override
        public void onComplete() {
            delegate.onComplete();
        }
    }
}
