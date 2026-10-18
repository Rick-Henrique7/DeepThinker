package com.deepthinker.note;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.Map;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Converte o Map do Java em texto JSON para gravar no banco, e de volta.
 * Faz o papel do cast 'source_meta' => 'array' do Eloquent.
 */
@Converter
public class JsonMapConverter implements AttributeConverter<Map<String, Object>, String> {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Override
    public String convertToDatabaseColumn(Map<String, Object> value) {
        return value == null ? null : JSON.writeValueAsString(value);
    }

    @Override
    public Map<String, Object> convertToEntityAttribute(String json) {
        return json == null ? null : JSON.readValue(json, new TypeReference<>() {});
    }
}
