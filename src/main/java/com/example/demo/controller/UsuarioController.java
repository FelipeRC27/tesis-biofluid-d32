package com.example.demo.controller;

import com.example.demo.dto.UsuarioRequest;
import com.example.demo.dto.UsuarioResponse;
import com.example.demo.dto.VendedorResponse;
import com.example.demo.security.AuthenticatedUser;
import com.example.demo.service.UsuarioService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/usuarios")
public class UsuarioController {
    private final UsuarioService service;

    public UsuarioController(UsuarioService service) {
        this.service = service;
    }

    @GetMapping
    public List<UsuarioResponse> findAll() {
        return service.findAllDto();
    }

    @GetMapping("/vendedores")
    public List<VendedorResponse> findVendedores() {
        return service.findVendedoresHabilitados();
    }

    @GetMapping("/{id}")
    public UsuarioResponse findById(@PathVariable Integer id) {
        return service.findDtoById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UsuarioResponse create(@Valid @RequestBody UsuarioRequest request, @AuthenticationPrincipal AuthenticatedUser user) {
        return service.create(request, resolveAuditUser(user));
    }

    @PutMapping("/{id}")
    public UsuarioResponse update(
            @PathVariable Integer id,
            @Valid @RequestBody UsuarioRequest request,
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return service.update(id, request, resolveAuditUser(user));
    }

    private String resolveAuditUser(AuthenticatedUser user) {
        return user != null ? user.getUsername() : null;
    }

}
