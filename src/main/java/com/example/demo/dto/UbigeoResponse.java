package com.example.demo.dto;

public record UbigeoResponse(
        Integer idUbigeoInei,
        String ubigeo,
        String departamento,
        String provincia,
        String distrito,
        Integer flagCobertura,
        Boolean tieneCobertura
) {
}
