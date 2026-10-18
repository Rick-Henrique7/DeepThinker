package com.deepthinker.canvas;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * /api/canvases: a lista, criar (POST), abrir (GET /{id}), salvar (PUT /{id}, com revision)
 * e apagar (DELETE /{id}).
 */
@RestController
@RequestMapping("/api/canvases")
public class CanvasController {

    private final CanvasService canvases;

    public CanvasController(CanvasService canvases) {
        this.canvases = canvases;
    }

    @GetMapping
    public List<CanvasService.CanvasItem> list() {
        return canvases.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CanvasService.CanvasDetail create(@RequestBody(required = false) CanvasService.CanvasWrite body) {
        return canvases.create(body);
    }

    @GetMapping("/{id}")
    public CanvasService.CanvasDetail get(@PathVariable Long id) {
        return canvases.get(id);
    }

    @PutMapping("/{id}")
    public CanvasService.CanvasDetail update(@PathVariable Long id, @RequestBody CanvasService.CanvasWrite body) {
        return canvases.update(id, body);
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable Long id) {
        canvases.delete(id);
        return Map.of("ok", true);
    }
}
