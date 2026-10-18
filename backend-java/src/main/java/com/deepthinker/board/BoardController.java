package com.deepthinker.board;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET    /api/board                    o Quadro: colunas na ordem, cada uma com os cartões
 * POST   /api/board/columns            {"name"} cria coluna
 * PATCH  /api/board/columns/{id}       {"name"} renomeia e/ou {"position"} muda de lugar
 * DELETE /api/board/columns/{id}       exclui (os cartões saem do Quadro; notas não são apagadas)
 * POST   /api/board/cards              {"title","content","column"} cartão que vive só no Quadro
 * PUT    /api/board/notes/{id}         {"column"} põe a nota no Quadro ou muda de coluna
 * DELETE /api/board/notes/{id}         tira a nota do Quadro (a nota continua existindo)
 */
@RestController
@RequestMapping("/api/board")
public class BoardController {

    private final BoardService board;

    public BoardController(BoardService board) {
        this.board = board;
    }

    public record ColumnRequest(String name, Integer position) {
    }

    public record CardRequest(String title, String content, String column) {
    }

    public record PlaceRequest(String column) {
    }

    @GetMapping
    public BoardService.Board show() {
        return board.board();
    }

    @PostMapping("/columns")
    @ResponseStatus(HttpStatus.CREATED)
    public BoardService.Column createColumn(@RequestBody ColumnRequest req) {
        return board.createColumn(req.name());
    }

    @PatchMapping("/columns/{id}")
    public BoardService.Board updateColumn(@PathVariable Long id, @RequestBody ColumnRequest req) {
        if (req.name() != null) {
            board.renameColumn(id, req.name());
        }
        if (req.position() != null) {
            board.moveColumn(id, req.position());
        }
        return board.board();
    }

    @DeleteMapping("/columns/{id}")
    public Map<String, Object> deleteColumn(@PathVariable Long id) {
        int removed = board.deleteColumn(id);
        return Map.of("message", "Coluna excluída.", "cards_removed", removed);
    }

    @PostMapping("/cards")
    @ResponseStatus(HttpStatus.CREATED)
    public BoardService.Card createCard(@RequestBody CardRequest req) {
        return board.createCard(req.title(), req.content(), req.column());
    }

    @PutMapping("/notes/{id}")
    public Map<String, Object> place(@PathVariable Long id, @RequestBody(required = false) PlaceRequest req) {
        String column = board.addToBoard(id, req == null ? null : req.column());
        return Map.of("id", id, "column", column);
    }

    @DeleteMapping("/notes/{id}")
    public Map<String, Object> remove(@PathVariable Long id) {
        board.removeFromBoard(id);
        return Map.of("id", id, "message", "Nota tirada do Quadro.");
    }
}
