package com.example.demo.service;

import com.example.demo.dto.UbigeoCoberturaResponse;
import com.example.demo.dto.UbigeoResponse;
import java.util.List;

public interface UbigeoIneiService {
    List<String> listarDepartamentos();

    List<String> listarProvinciasPorDepartamento(String departamento);

    List<String> listarDistritosPorDepartamentoYProvincia(String departamento, String provincia);

    UbigeoResponse consultarUbigeo(String departamento, String provincia, String distrito);

    UbigeoCoberturaResponse consultarCoberturaPorUbigeo(String ubigeo);

    UbigeoResponse consultarDetallePorUbigeo(String ubigeo);
}
