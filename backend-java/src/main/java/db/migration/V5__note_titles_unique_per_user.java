package db.migration;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * Migration em Java (o Flyway acha esta classe pelo pacote db.migration e pelo nome V5__...).
 *
 * Antes, o título da nota era único no banco inteiro. Com login, duas pessoas
 * podem ter uma nota "Ideias"; o título passa a ser único por usuário.
 *
 * Por que Java e não SQL? A V1 criou o UNIQUE sem dar nome. O PostgreSQL o chama
 * de "notes_title_key" e o H2 de algo como "constraint_4". Aqui perguntamos ao
 * próprio banco (information_schema) qual é o nome antes de apagar.
 */
public class V5__note_titles_unique_per_user extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection conn = context.getConnection();
        List<String> names = new ArrayList<>();
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("""
                     SELECT tc.constraint_name
                       FROM information_schema.table_constraints tc
                       JOIN information_schema.key_column_usage k
                         ON k.constraint_name = tc.constraint_name
                        AND k.table_name = tc.table_name
                      WHERE LOWER(tc.table_name) = 'notes'
                        AND tc.constraint_type = 'UNIQUE'
                        AND LOWER(k.column_name) = 'title'
                     """)) {
            while (rs.next()) {
                names.add(rs.getString(1));
            }
        }
        try (Statement st = conn.createStatement()) {
            for (String name : names) {
                st.execute("ALTER TABLE notes DROP CONSTRAINT \"" + name + "\"");
            }
            st.execute("ALTER TABLE notes ADD CONSTRAINT notes_user_title_unique UNIQUE (user_id, title)");
        }
    }
}
