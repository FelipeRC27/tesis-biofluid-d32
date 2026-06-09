package com.example.demo.mapper;

import com.example.demo.dto.UbigeoCoberturaResponse;
import com.example.demo.dto.UbigeoResponse;
import com.example.demo.model.UbigeoInei;
import org.springframework.stereotype.Component;

@Component
public class UbigeoIneiMapper {
    public UbigeoResponse toResponse(UbigeoInei entity) {
        return new UbigeoResponse(
                entity.idUbigeoInei,
                entity.ubigeo,
                entity.departamento,
                entity.provincia,
                entity.distrito,
                entity.flagCobertura,
                hasCobertura(entity)
        );
    }

    public UbigeoCoberturaResponse toCoberturaResponse(UbigeoInei entity) {
        return new UbigeoCoberturaResponse(
                entity.ubigeo,
                entity.flagCobertura,
                hasCobertura(entity)
        );
    }

    private Boolean hasCobertura(UbigeoInei entity) {
        return entity.flagCobertura != null && entity.flagCobertura == 1;
    }
}
