package db.migration;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import io.github.gandalfthejunior.mtgcommanderstats.displaytext.InvalidNameException;
import io.github.gandalfthejunior.mtgcommanderstats.displaytext.NameRules;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

public class V16__validate_names extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        validate(context, "users", "username", 20);
        validate(context, "decks", "name", 30);
        validate(context, "play_groups", "name", 30);
        try (Statement statement = context.getConnection().createStatement()) {
            // PostgreSQL counts code points, so these bounds deliberately allow
            // multi-code-point graphemes. Full validation belongs to Java.
            statement.execute("ALTER TABLE users ADD CONSTRAINT users_username_code_points CHECK (char_length(username) <= 80)");
            statement.execute("ALTER TABLE decks ADD CONSTRAINT decks_name_code_points CHECK (char_length(name) <= 120)");
            statement.execute("ALTER TABLE play_groups ADD CONSTRAINT play_groups_name_code_points CHECK (char_length(name) <= 120)");
        }
    }

    private void validate(Context context, String table, String column, int maxLength) throws SQLException {
        // Table/column identifiers are fixed migration constants, never user input.
        try (Statement statement = context.getConnection().createStatement();
                ResultSet rows = statement.executeQuery("SELECT id, " + column + " FROM " + table)) {
            while (rows.next()) {
                String value = rows.getString(column);
                try {
                    if (value != null && value.equals(NameRules.normalize(value, maxLength))) {
                        continue;
                    }
                } catch (InvalidNameException exception) {
                    // Refuse the upgrade without rewriting or exposing the stored name.
                }
                throw new SQLException("Nonconforming " + table + "." + column + " at row " + rows.getString("id")
                        + ". Reset nonconforming development/demo data before retrying the migration.");
            }
        }
    }
}
