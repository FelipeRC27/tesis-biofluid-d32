package com.example.demo.controller;

import com.example.demo.dto.CotizacionCreateRequest;
import com.example.demo.dto.CotizacionEstadoUpdateRequest;
import com.example.demo.dto.CotizacionCalcularItemRequest;
import com.example.demo.dto.CotizacionCalcularItemResponse;
import com.example.demo.dto.CotizacionCalcularResumenRequest;
import com.example.demo.dto.CotizacionCalcularResumenResponse;
import com.example.demo.dto.CotizacionPdfResponse;
import com.example.demo.dto.CotizacionPrecioProductoResponse;
import com.example.demo.dto.CotizacionV1Response;
import com.example.demo.security.AuthenticatedUser;
import com.example.demo.service.CotizacionPdfService;
import com.example.demo.service.CotizacionV1Service;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.Resource;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/cotizaciones")
public class CotizacionV1Controller {
    private final CotizacionV1Service service;
    private final CotizacionPdfService pdfService;

    public CotizacionV1Controller(CotizacionV1Service service, CotizacionPdfService pdfService) {
        this.service = service;
        this.pdfService = pdfService;
    }

    @GetMapping
    public List<CotizacionV1Response> findAll(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Integer idCliente,
            @RequestParam(required = false) Integer idVendedor,
            @RequestParam(required = false) Integer idEstadoCotizacion,
            @RequestParam(required = false) LocalDate fechaInicio,
            @RequestParam(required = false) LocalDate fechaFin
    ) {
        return service.findAll(search, idCliente, idVendedor, idEstadoCotizacion, fechaInicio, fechaFin);
    }

    @GetMapping("/precio-producto")
    public CotizacionPrecioProductoResponse obtenerPrecioProducto(
            @RequestParam Integer idCliente,
            @RequestParam Integer idProducto,
            @RequestParam String moneda
    ) {
        return service.obtenerPrecioProducto(idCliente, idProducto, moneda);
    }

    @PostMapping("/calcular-item")
    public CotizacionCalcularItemResponse calcularItem(@Valid @RequestBody CotizacionCalcularItemRequest request) {
        return service.calcularItem(request);
    }

    @PostMapping("/calcular-resumen")
    public CotizacionCalcularResumenResponse calcularResumen(@Valid @RequestBody CotizacionCalcularResumenRequest request) {
        return service.calcularResumen(request);
    }

    @GetMapping("/{id}")
    public CotizacionV1Response findById(@PathVariable Integer id) { return service.findById(id); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CotizacionV1Response create(
            @Valid @RequestBody CotizacionCreateRequest request,
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return service.create(request, resolveActor(user));
    }

    @PatchMapping("/{id}/estado")
    public CotizacionV1Response patchEstado(
            @PathVariable Integer id,
            @Valid @RequestBody CotizacionEstadoUpdateRequest request,
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return service.patchEstado(id, request.idEstadoCotizacion(), resolveActor(user));
    }

    @PostMapping("/procesar-vencidas")
    public Integer procesarVencidas(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.procesarCotizacionesVencidas(resolveActor(user));
    }

    @PostMapping("/{id}/generar-pdf")
    public CotizacionPdfResponse generarPdf(
            @PathVariable Integer id,
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return pdfService.generarPdfCotizacion(id, resolveActor(user));
    }

    @GetMapping(value = "/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @Operation(summary = "Descargar PDF de cotizacion")
    @ApiResponse(
            responseCode = "200",
            description = "Archivo PDF de la cotizacion",
            content = @Content(
                    mediaType = MediaType.APPLICATION_PDF_VALUE,
                    schema = @Schema(type = "string", format = "binary")
            )
    )
    public ResponseEntity<Resource> descargarPdf(@PathVariable Integer id) {
        return pdfService.descargarPdfCotizacion(id);
    }

    private String resolveActor(AuthenticatedUser user) {
        if (user != null && user.getUsuario() != null && user.getUsuario().correo != null) {
            return user.getUsuario().correo;
        }
        return "system";
    }
}
