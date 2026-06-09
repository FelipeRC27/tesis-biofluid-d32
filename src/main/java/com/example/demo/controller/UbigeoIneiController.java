package com.example.demo.controller;

import com.example.demo.dto.UbigeoCoberturaResponse;
import com.example.demo.dto.UbigeoResponse;
import com.example.demo.service.UbigeoIneiService;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/ubigeos")
public class UbigeoIneiController {
    private final UbigeoIneiService ubigeoIneiService;

    public UbigeoIneiController(UbigeoIneiService ubigeoIneiService) {
        this.ubigeoIneiService = ubigeoIneiService;
    }

    @GetMapping("/departamentos")
    public ResponseEntity<List<String>> listarDepartamentos() {
        return ResponseEntity.ok(ubigeoIneiService.listarDepartamentos());
    }

    @GetMapping("/provincias")
    public ResponseEntity<List<String>> listarProvincias(@RequestParam String departamento) {
        return ResponseEntity.ok(ubigeoIneiService.listarProvinciasPorDepartamento(departamento));
    }

    @GetMapping("/distritos")
    public ResponseEntity<List<String>> listarDistritos(
            @RequestParam String departamento,
            @RequestParam String provincia
    ) {
        return ResponseEntity.ok(ubigeoIneiService.listarDistritosPorDepartamentoYProvincia(departamento, provincia));
    }

    @GetMapping("/codigo")
    public ResponseEntity<UbigeoResponse> consultarCodigo(
            @RequestParam String departamento,
            @RequestParam String provincia,
            @RequestParam String distrito
    ) {
        return ResponseEntity.ok(ubigeoIneiService.consultarUbigeo(departamento, provincia, distrito));
    }

    @GetMapping("/{ubigeo}/cobertura")
    public ResponseEntity<UbigeoCoberturaResponse> consultarCobertura(@PathVariable String ubigeo) {
        return ResponseEntity.ok(ubigeoIneiService.consultarCoberturaPorUbigeo(ubigeo));
    }

    @GetMapping("/{ubigeo}")
    public ResponseEntity<UbigeoResponse> consultarPorUbigeo(@PathVariable String ubigeo) {
        return ResponseEntity.ok(ubigeoIneiService.consultarDetallePorUbigeo(ubigeo));
    }
}
