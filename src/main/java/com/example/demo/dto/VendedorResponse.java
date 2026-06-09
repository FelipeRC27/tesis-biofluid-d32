package com.example.demo.dto;

public record VendedorResponse(
        Integer idUsuario,
        String nombres,
        String apellidoPaterno,
        String apellidoMaterno,
        String nombreCompleto,
        String correo
) {
}
