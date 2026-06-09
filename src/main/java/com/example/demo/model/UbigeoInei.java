package com.example.demo.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "UBIGEO_INEI")
public class UbigeoInei {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ID_UBIGEO_INEI")
    public Integer idUbigeoInei;

    @Column(name = "UBIGEO", length = 6, nullable = false)
    public String ubigeo;

    @Column(name = "DISTRITO", length = 150, nullable = false)
    public String distrito;

    @Column(name = "PROVINCIA", length = 150, nullable = false)
    public String provincia;

    @Column(name = "DEPARTAMENTO", length = 150, nullable = false)
    public String departamento;

    @Column(name = "FLAG_COBERTURA", nullable = false)
    public Integer flagCobertura;
}
