package com.deepthinker.document;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.auth.AuthService;
import com.deepthinker.chat.FakeLlmServer;
import com.deepthinker.llm.LlmSettingRepository;
import com.deepthinker.note.ConnectionRepository;
import com.deepthinker.note.NoteRepository;
import com.deepthinker.support.TestLogin;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
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
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Leitor: arquivo original guardado e destaques que viram notas ligadas ao documento. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HighlightApiTest {

    @DynamicPropertySource
    static void llmProps(DynamicPropertyRegistry registry) {
        registry.add("deepthinker.llm.provider", () -> "lmstudio");
        registry.add("deepthinker.llm.plugins.lmstudio.base-url", FakeLlmServer::start);
    }

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    @Autowired
    NoteRepository notes;

    @Autowired
    ConnectionRepository connections;

    @Autowired
    LlmSettingRepository settings;

    @Autowired
    DocumentFileRepository files;

    MockMvc mvc;

    final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void clean() {
        mvc = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        connections.deleteAll();
        notes.deleteAll();
        settings.deleteAll();
    }

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

    private JsonNode read(org.springframework.test.web.servlet.ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private JsonNode upload(String name, String type, byte[] bytes) throws Exception {
        return read(mvc.perform(multipart("/api/documents/upload").file(new MockMultipartFile("file", name, type, bytes)))
                .andExpect(status().isCreated())).get("note");
    }

    private org.springframework.test.web.servlet.ResultActions highlight(MockMvc as, long docId, Map<String, Object> body)
            throws Exception {
        return as.perform(post("/api/documents/" + docId + "/highlights").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    @Test
    void theOriginalPdfIsKeptAndServedBack() throws Exception {
        byte[] pdf = pdfWith("Um texto sobre estrategia de produto.");
        long id = upload("artigo.pdf", "text/html", pdf).get("id").asLong();

        // O tipo vem da extensão conferida, não do que o navegador disse ("text/html").
        byte[] served = mvc.perform(get("/api/documents/" + id + "/file"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("application/pdf"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Content-Disposition", containsString("artigo.pdf")))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(served).isEqualTo(pdf);

        mvc.perform(get("/api/documents"))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].kind").value("pdf"))
                .andExpect(jsonPath("$[0].filename").value("artigo.pdf"))
                .andExpect(jsonPath("$[0].size").value(pdf.length))
                .andExpect(jsonPath("$[0].highlights").value(0));

        // Um documento só: o Leitor pede isto antes, para saber se há arquivo para buscar.
        mvc.perform(get("/api/documents/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("pdf"))
                .andExpect(jsonPath("$.filename").value("artigo.pdf"));
        long plain = read(mvc.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Comum\",\"content\":\"Uma nota comum.\"}"))).get("id").asLong();
        mvc.perform(get("/api/documents/" + plain)).andExpect(status().isUnprocessableContent());
    }

    @Test
    void aPdfHighlightBecomesANoteLinkedToTheDocument() throws Exception {
        JsonNode doc = upload("plano.pdf", "application/pdf", pdfWith("O custo fixo e o maior risco."));
        long docId = doc.get("id").asLong();
        String docTitle = doc.get("title").asString();

        JsonNode h = read(highlight(mvc, docId, Map.of(
                "quote", "O custo fixo é o maior risco\nde uma cafeteria pequena, então [comece] pequeno.",
                "page", 1,
                "rects", List.of(Map.of("x", 0.1, "y", 0.2, "w", 0.5, "h", 0.02),
                        Map.of("x", 0.9, "y", 0.25, "w", 0.4, "h", 0.02)),
                "color", "verde",
                "comment", "Rever o aluguel."))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.color").value("verde"))
                .andExpect(jsonPath("$.note").value("Rever o aluguel."))
                // O retângulo que passava da borda foi cortado no fim da página.
                .andExpect(jsonPath("$.rects[1].w").value(0.1)));

        long noteId = h.get("id").asLong();
        String title = h.get("title").asString();
        assertThat(title).startsWith("“O custo fixo é o maior risco de uma cafeteria").endsWith("…”").doesNotContain("[");

        // É uma nota de verdade: tem o trecho, o link para o documento e as propriedades.
        mvc.perform(get("/api/notes/" + noteId))
                .andExpect(jsonPath("$.source_type").value("highlight"))
                .andExpect(jsonPath("$.content").value(containsString("> O custo fixo é o maior risco de uma cafeteria")))
                .andExpect(jsonPath("$.content").value(containsString("Destaque de [[" + docTitle + "]], página 1.")))
                .andExpect(jsonPath("$.properties.tipo").value("destaque"))
                .andExpect(jsonPath("$.properties['página']").value(1))
                .andExpect(jsonPath("$.connected_notes[0].id").value(docId));

        mvc.perform(get("/api/documents/" + docId + "/highlights"))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].quote").value(containsString("cafeteria pequena")));
        mvc.perform(get("/api/documents")).andExpect(jsonPath("$[0].highlights").value(1));

        // O comentário que aparece no Leitor é o texto atual da nota.
        String edited = mvc.perform(get("/api/notes/" + noteId)).andReturn().getResponse().getContentAsString();
        String content = json.readTree(edited).get("content").asString().replace("Rever o aluguel.", "Pedir 3 orçamentos.");
        mvc.perform(put("/api/notes/" + noteId).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("title", title, "content", content))))
                .andExpect(status().isOk());
        mvc.perform(get("/api/documents/" + docId + "/highlights")).andExpect(jsonPath("$[0].note").value("Pedir 3 orçamentos."));

        // O mesmo trecho de novo não quebra: o título ganha um (2).
        highlight(mvc, docId, Map.of("quote", "O custo fixo é o maior risco\nde uma cafeteria pequena, então [comece] pequeno.",
                "page", 1, "rects", List.of(Map.of("x", 0.1, "y", 0.2, "w", 0.5, "h", 0.02))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value(title + " (2)"));
    }

    @Test
    void textDocumentsUsePositionsInTheText() throws Exception {
        String text = "# Ideias\n\nVender café na porta da faculdade.";
        long docId = upload("ideias.md", "text/markdown", text.getBytes(StandardCharsets.UTF_8)).get("id").asLong();
        mvc.perform(get("/api/documents/" + docId + "/file"))
                .andExpect(content().contentTypeCompatibleWith("text/markdown"))
                .andExpect(content().string(text));

        int start = text.indexOf("café");
        highlight(mvc, docId, Map.of("quote", "café na porta", "start", start, "end", start + 13))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.start").value(start))
                .andExpect(jsonPath("$.page").doesNotExist());
        mvc.perform(get("/api/documents/" + docId + "/highlights")).andExpect(jsonPath("$[0].color").value("amarelo"));
    }

    @Test
    void badHighlightsAreRefused() throws Exception {
        long docId = upload("plano.pdf", "application/pdf", pdfWith("Texto.")).get("id").asLong();
        List<Map<String, Object>> rects = List.of(Map.of("x", 0.1, "y", 0.1, "w", 0.2, "h", 0.02));

        highlight(mvc, docId, Map.of("quote", "  ", "page", 1, "rects", rects)).andExpect(status().isUnprocessableContent());
        highlight(mvc, docId, Map.of("quote", "trecho", "page", 1)).andExpect(status().isUnprocessableContent());
        highlight(mvc, docId, Map.of("quote", "trecho", "page", 0, "rects", rects)).andExpect(status().isUnprocessableContent());
        highlight(mvc, docId, Map.of("quote", "trecho", "page", 1, "rects", rects, "color", "preto"))
                .andExpect(status().isUnprocessableContent());
        highlight(mvc, docId, Map.of("quote", "trecho")).andExpect(status().isUnprocessableContent());
        highlight(mvc, docId, Map.of("quote", "x".repeat(3001), "page", 1, "rects", rects))
                .andExpect(status().isUnprocessableContent());

        // Só dá para destacar em documento importado.
        String plain = mvc.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Nota comum\",\"content\":\"oi\"}")).andReturn().getResponse().getContentAsString();
        long plainId = json.readTree(plain).get("id").asLong();
        highlight(mvc, plainId, Map.of("quote", "oi", "start", 0, "end", 2)).andExpect(status().isUnprocessableContent());
    }

    @Test
    void deletingAHighlightAndOtherPeoplesAccess() throws Exception {
        long docId = upload("plano.pdf", "application/pdf", pdfWith("Texto.")).get("id").asLong();
        long hid = read(highlight(mvc, docId, Map.of("quote", "Texto", "page", 1,
                "rects", List.of(Map.of("x", 0.1, "y", 0.1, "w", 0.2, "h", 0.02))))).get("id").asLong();

        MockMvc other = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        other.perform(get("/api/documents/" + docId)).andExpect(status().isNotFound());
        other.perform(get("/api/documents/" + docId + "/file")).andExpect(status().isNotFound());
        other.perform(get("/api/documents/" + docId + "/highlights")).andExpect(status().isNotFound());
        other.perform(delete("/api/documents/" + docId + "/highlights/" + hid)).andExpect(status().isNotFound());
        other.perform(get("/api/documents")).andExpect(jsonPath("$", hasSize(0)));

        // Uma nota que não é destaque deste documento não pode ser apagada por aqui.
        mvc.perform(delete("/api/documents/" + docId + "/highlights/" + docId)).andExpect(status().isNotFound());

        mvc.perform(delete("/api/documents/" + docId + "/highlights/" + hid)).andExpect(status().isOk());
        mvc.perform(get("/api/notes/" + hid)).andExpect(status().isNotFound());
        mvc.perform(get("/api/documents/" + docId + "/highlights")).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void oldDocumentsCanGetTheirFileBackAndDeletingTheDocumentRemovesIt() throws Exception {
        byte[] pdf = pdfWith("Texto antigo.");
        long docId = upload("antigo.pdf", "application/pdf", pdf).get("id").asLong();
        // Simula um documento importado antes da V9: sem arquivo guardado.
        files.deleteAll();
        mvc.perform(get("/api/documents/" + docId + "/file")).andExpect(status().isNotFound());
        mvc.perform(get("/api/documents")).andExpect(jsonPath("$[0].kind").doesNotExist());
        // Sem arquivo, o nome vem da nota (guardado no upload em source_meta).
        mvc.perform(get("/api/documents/" + docId))
                .andExpect(jsonPath("$.kind").doesNotExist())
                .andExpect(jsonPath("$.filename").value("antigo.pdf"));

        mvc.perform(multipart("/api/documents/" + docId + "/file")
                        .file(new MockMultipartFile("file", "virus.exe", "application/pdf", pdf)))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(multipart("/api/documents/" + docId + "/file")
                        .file(new MockMultipartFile("file", "falso.pdf", "application/pdf", "não é pdf".getBytes())))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(multipart("/api/documents/" + docId + "/file")
                        .file(new MockMultipartFile("file", "antigo.pdf", "application/pdf", pdf)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("pdf"));
        mvc.perform(get("/api/documents/" + docId + "/file")).andExpect(status().isOk());

        long hid = read(highlight(mvc, docId, Map.of("quote", "Texto", "page", 1,
                "rects", List.of(Map.of("x", 0.1, "y", 0.1, "w", 0.2, "h", 0.02))))).get("id").asLong();

        // Apagar o documento apaga o arquivo; o destaque continua (é uma nota sua).
        mvc.perform(delete("/api/notes/" + docId)).andExpect(status().is2xxSuccessful());
        assertThat(files.count()).isZero();
        mvc.perform(get("/api/notes/" + hid)).andExpect(status().isOk());
    }
}
