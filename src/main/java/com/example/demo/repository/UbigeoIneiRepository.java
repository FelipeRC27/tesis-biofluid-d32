package com.example.demo.repository;

import com.example.demo.model.UbigeoInei;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UbigeoIneiRepository extends JpaRepository<UbigeoInei, Integer> {
    @Query("SELECT DISTINCT u.departamento FROM UbigeoInei u ORDER BY u.departamento")
    List<String> findDistinctDepartamentos();

    @Query("""
            SELECT DISTINCT u.provincia
            FROM UbigeoInei u
            WHERE UPPER(u.departamento) = UPPER(:departamento)
            ORDER BY u.provincia
            """)
    List<String> findDistinctProvinciasByDepartamento(@Param("departamento") String departamento);

    @Query("""
            SELECT DISTINCT u.distrito
            FROM UbigeoInei u
            WHERE UPPER(u.departamento) = UPPER(:departamento)
              AND UPPER(u.provincia) = UPPER(:provincia)
            ORDER BY u.distrito
            """)
    List<String> findDistinctDistritosByDepartamentoAndProvincia(
            @Param("departamento") String departamento,
            @Param("provincia") String provincia
    );

    Optional<UbigeoInei> findByDepartamentoIgnoreCaseAndProvinciaIgnoreCaseAndDistritoIgnoreCase(
            String departamento,
            String provincia,
            String distrito
    );

    Optional<UbigeoInei> findByUbigeo(String ubigeo);
}
