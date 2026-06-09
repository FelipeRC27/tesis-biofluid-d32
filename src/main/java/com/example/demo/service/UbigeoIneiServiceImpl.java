package com.example.demo.service;

import com.example.demo.dto.UbigeoCoberturaResponse;
import com.example.demo.dto.UbigeoResponse;
import com.example.demo.exception.ResourceNotFoundException;
import com.example.demo.mapper.UbigeoIneiMapper;
import com.example.demo.model.UbigeoInei;
import com.example.demo.repository.UbigeoIneiRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UbigeoIneiServiceImpl implements UbigeoIneiService {
    private static final String UBIGEO_PATTERN = "\\d{6}";

    private final UbigeoIneiRepository ubigeoIneiRepository;
    private final UbigeoIneiMapper mapper;

    public UbigeoIneiServiceImpl(UbigeoIneiRepository ubigeoIneiRepository, UbigeoIneiMapper mapper) {
        this.ubigeoIneiRepository = ubigeoIneiRepository;
        this.mapper = mapper;
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> listarDepartamentos() {
        return ubigeoIneiRepository.findDistinctDepartamentos();
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> listarProvinciasPorDepartamento(String departamento) {
        String departamentoNormalizado = normalizeRequired(departamento, "El departamento es obligatorio.");
        return ubigeoIneiRepository.findDistinctProvinciasByDepartamento(departamentoNormalizado);
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> listarDistritosPorDepartamentoYProvincia(String departamento, String provincia) {
        String departamentoNormalizado = normalizeRequired(departamento, "El departamento es obligatorio.");
        String provinciaNormalizada = normalizeRequired(provincia, "La provincia es obligatoria.");
        return ubigeoIneiRepository.findDistinctDistritosByDepartamentoAndProvincia(
                departamentoNormalizado,
                provinciaNormalizada
        );
    }

    @Override
    @Transactional(readOnly = true)
    public UbigeoResponse consultarUbigeo(String departamento, String provincia, String distrito) {
        String departamentoNormalizado = normalizeRequired(departamento, "El departamento es obligatorio.");
        String provinciaNormalizada = normalizeRequired(provincia, "La provincia es obligatoria.");
        String distritoNormalizado = normalizeRequired(distrito, "El distrito es obligatorio.");

        UbigeoInei entity = ubigeoIneiRepository
                .findByDepartamentoIgnoreCaseAndProvinciaIgnoreCaseAndDistritoIgnoreCase(
                        departamentoNormalizado,
                        provinciaNormalizada,
                        distritoNormalizado
                )
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No se encontro ubigeo para el departamento, provincia y distrito indicados."
                ));

        return mapper.toResponse(entity);
    }

    @Override
    @Transactional(readOnly = true)
    public UbigeoCoberturaResponse consultarCoberturaPorUbigeo(String ubigeo) {
        return mapper.toCoberturaResponse(findByUbigeo(normalizeUbigeo(ubigeo)));
    }

    @Override
    @Transactional(readOnly = true)
    public UbigeoResponse consultarDetallePorUbigeo(String ubigeo) {
        return mapper.toResponse(findByUbigeo(normalizeUbigeo(ubigeo)));
    }

    private UbigeoInei findByUbigeo(String ubigeo) {
        return ubigeoIneiRepository.findByUbigeo(ubigeo)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No se encontro informacion para el ubigeo: " + ubigeo
                ));
    }

    private String normalizeRequired(String value, String message) {
        String normalized = value == null ? "" : value.trim().replaceAll("\\s+", " ");
        if (normalized.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return normalized;
    }

    private String normalizeUbigeo(String ubigeo) {
        String normalized = normalizeRequired(ubigeo, "El codigo de ubigeo es obligatorio.");
        if (!normalized.matches(UBIGEO_PATTERN)) {
            throw new IllegalArgumentException("El codigo de ubigeo debe tener 6 digitos.");
        }
        return normalized;
    }
}
