package io.github.gandalfthejunior.mtgcommanderstats;

import java.net.http.HttpResponse;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.github.gandalfthejunior.mtgcommanderstats.group.api.InvitationErrors;
import io.github.gandalfthejunior.mtgcommanderstats.group.application.ManageGroups;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.slf4j.LoggerFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;

@ExtendWith(OutputCaptureExtension.class)
class InvitationErrorsTest extends GameTestSupport {
    @MockitoSpyBean
    private ManageGroups previewService;

    @Test
    void unexpectedPreviewFailureDoesNotExposeTokenInResponseOrApplicationLogs(CapturedOutput output) throws Exception {
        Fixture f = fixture();
        String code = groupService.createInvitation(f.owner().id(), f.groupId()).code();
        String path = "/api/invitations/" + code;
        doThrow(new IllegalStateException("Sensitive dependency failure at " + path)).when(previewService).preview(code);
        Logger logger = (Logger) LoggerFactory.getLogger(InvitationErrors.class);
        ListAppender<ILoggingEvent> events = new ListAppender<>();
        events.start();
        logger.addAppender(events);
        HttpResponse<String> response;
        try {
            response = send(null, "GET", path, "");
        } finally {
            logger.detachAppender(events);
            events.stop();
        }
        assertThat(events.list).hasSize(1);
        ILoggingEvent signal = events.list.get(0);
        assertThat(signal.getLevel()).isEqualTo(Level.ERROR);
        assertThat(signal.getFormattedMessage()).isEqualTo(
                "Invitation preview failed: exceptionType=java.lang.IllegalStateException");
        assertThat(signal.getThrowableProxy()).isNull();
        assertThat(response.statusCode()).isEqualTo(500);
        assertThat(json.readTree(response.body()).get("instance").asText()).isEqualTo("/api/invitations");
        assertThat(response.body()).doesNotContain(code, "Sensitive dependency failure", "Pod", "path", "trace");
        assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/problem+json");
        assertThat(response.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
        assertThat(response.headers().firstValue("Referrer-Policy").orElseThrow()).isEqualTo("no-referrer");
        assertThat(output.getAll()).doesNotContain(code, "Sensitive dependency failure");
    }
}
