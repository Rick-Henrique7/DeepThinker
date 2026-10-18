package com.deepthinker.document;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.chat.FakeLlmServer;
import com.deepthinker.llm.LlmSettingRepository;
import com.deepthinker.note.ConnectionRepository;
import com.deepthinker.note.NoteRepository;
import java.io.ByteArrayOutputStream;
import java.util.Map;
import java.nio.charset.StandardCharsets;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import com.deepthinker.auth.AuthService;
import com.deepthinker.support.TestLogin;
import org.springframework.web.context.WebApplicationContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Upload de documentos usando o FakeLlmServer no lugar da IA. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DocumentApiTest {

    @DynamicPropertySource
    static void llmProps(DynamicPropertyRegistry registry) {
        registry.add("deepthinker.llm.provider", () -> "lmstudio");
        registry.add("deepthinker.llm.plugins.lmstudio.base-url", FakeLlmServer::start);
    }

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    /** MockMvc já logado com uma conta nova a cada teste (ver TestLogin). */
    MockMvc mvc;

    String token;

    @Autowired
    NoteRepository notes;

    @Autowired
    ConnectionRepository connections;

    @Autowired
    LlmSettingRepository settings;

    @BeforeEach
    void clean() {
        token = TestLogin.newUserToken(auth);
        mvc = TestLogin.mvcAs(ctx, token);
        connections.deleteAll();
        notes.deleteAll();
        settings.deleteAll();
    }

    /** Gera um PDF de verdade, com uma linha de texto, usando o próprio PDFBox. */
    private static byte[] pdfWith(String text) throws Exception {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(50, 700);
                cs.showText(text);
                cs.endText();
            }
            doc.save(out);
            return out.toByteArray();
        }
    }

    @Test
    void pdfBecomesLinkedNotes() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "artigo.pdf", "application/pdf",
                pdfWith("Um texto sobre estrategia de produto."));

        mvc.perform(multipart("/api/documents/upload").file(file))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.note.title").value("Resumo do teste"))
                .andExpect(jsonPath("$.note.source_type").value("document"))
                .andExpect(jsonPath("$.note.source_meta.filename").value("artigo.pdf"))
                .andExpect(jsonPath("$.note.content").value(org.hamcrest.Matchers.containsString("estrategia")))
                .andExpect(jsonPath("$.created").value(2))
                .andExpect(jsonPath("$.fallback").doesNotExist());

        mvc.perform(get("/api/graph")).andExpect(jsonPath("$.links", hasSize(2)));
    }

    @Test
    void markdownWorksToo() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "ideias.md", "text/markdown",
                "# Ideias\n\nTexto em markdown.".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/documents/upload").file(file))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.extracted_chars").value(28));
    }

    @Test
    void whenTheAiFailsTheTextIsStillSaved() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "notas.txt", "text/plain",
                "SEM_JSON conteudo qualquer".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/documents/upload").file(file))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fallback").value(true))
                .andExpect(jsonPath("$.note.title").value("Doc: notas"));
    }

    @Test
    void rejectsOtherFileTypesAndEmptyText() throws Exception {
        mvc.perform(multipart("/api/documents/upload")
                        .file(new MockMultipartFile("file", "virus.exe", "application/octet-stream", new byte[] {1})))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(multipart("/api/documents/upload")
                        .file(new MockMultipartFile("file", "vazio.txt", "text/plain", "   ".getBytes())))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(multipart("/api/documents/upload")).andExpect(status().isUnprocessableContent());
    }

    @Test
    void mindmapIsSavedIntoTheDocumentNoteAndRedoingReplacesIt() throws Exception {
        JsonMapper json = JsonMapper.builder().build();
        MockMultipartFile file = new MockMultipartFile("file", "relatorio.md", "text/markdown",
                "# Relatório\n\nVendas, custos e equipe.".getBytes(StandardCharsets.UTF_8));
        JsonNode upload = json.readTree(mvc.perform(multipart("/api/documents/upload").file(file))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        long id = upload.get("note").get("id").asLong();

        String first = json.readTree(mvc.perform(post("/api/notes/" + id + "/mindmap"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("content").asString();
        assertThat(first).startsWith("## Mapa mental\n\n```mermaid\nmindmap").contains("Vendas, custos");

        // Um mapa velho "quebrado" na seção: se ele fosse mandado para a IA, ela não desenharia (SEM_DIAGRAMA).
        String title = upload.get("note").get("title").asString();
        String broken = first.replace("root((Teste))", "root((SEM_DIAGRAMA))");
        mvc.perform(put("/api/notes/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("title", title, "content", broken))))
                .andExpect(status().isOk());

        String again = json.readTree(mvc.perform(post("/api/notes/" + id + "/mindmap"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("content").asString();
        assertThat(again.split("## Mapa mental", -1)).as("uma seção só").hasSize(2);
        assertThat(again).doesNotContain("SEM_DIAGRAMA").contains("Vendas, custos");

        // O mapa anterior fica no histórico, com o motivo certo.
        mvc.perform(get("/api/notes/" + id + "/versions"))
                .andExpect(jsonPath("$[0].reason").value("mapa-mental"));

        MockMvc other = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        other.perform(post("/api/notes/" + id + "/mindmap")).andExpect(status().isNotFound());
    }
}
