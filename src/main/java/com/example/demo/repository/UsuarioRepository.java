package com.example.demo.repository;

import com.example.demo.model.Usuario;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UsuarioRepository extends JpaRepository<Usuario, Integer> {
    @Override
    @EntityGraph(attributePaths = {"estadoUsuario", "perfil", "tipoDocumento"})
    List<Usuario> findAll();

    @Override
    @EntityGraph(attributePaths = {"estadoUsuario", "perfil", "tipoDocumento"})
    Optional<Usuario> findById(Integer id);

    @EntityGraph(attributePaths = {"estadoUsuario", "perfil", "tipoDocumento"})
    Optional<Usuario> findByCorreo(String correo);

    @EntityGraph(attributePaths = {"estadoUsuario", "perfil", "tipoDocumento"})
    @Query("""
            SELECT u
            FROM Usuario u
            JOIN u.perfil p
            JOIN u.estadoUsuario e
            WHERE p.idPerfil = 4
              AND LOWER(e.desEstado) = 'habilitado'
            ORDER BY u.nombres ASC, u.apellidoPaterno ASC, u.apellidoMaterno ASC
            """)
    List<Usuario> findVendedoresHabilitados();

    boolean existsByCorreo(String correo);
    boolean existsByNroDocumento(String nroDocumento);
}
