package com.example.demo.service;

import com.example.demo.exception.ResourceNotFoundException;
import com.example.demo.model.Cliente;
import com.example.demo.model.Cotizacion;
import com.example.demo.model.Usuario;
import com.example.demo.repository.ClienteRepository;
import com.example.demo.repository.CotizacionRepository;
import com.example.demo.security.AuthenticatedUser;
import com.example.demo.security.Roles;
import java.util.Set;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccessControlService {
    private static final Set<String> FULL_ACCESS = Set.of(
            Roles.ROLE_SISTEMAS,
            Roles.ROLE_GERENTE,
            Roles.ROLE_ADMINISTRATIVO,
            Roles.ROLE_ADMIN
    );

    private final ClienteRepository clienteRepository;
    private final CotizacionRepository cotizacionRepository;

    public AccessControlService(ClienteRepository clienteRepository, CotizacionRepository cotizacionRepository) {
        this.clienteRepository = clienteRepository;
        this.cotizacionRepository = cotizacionRepository;
    }

    public boolean esAccesoTotal() {
        return hasAnyAuthority(FULL_ACCESS);
    }

    public boolean esJefeVentas() {
        return hasAuthority(Roles.ROLE_JEFE_VENTAS);
    }

    public boolean esVendedor() {
        return hasAuthority(Roles.ROLE_VENDEDOR);
    }

    public boolean puedeGestionarClientes() {
        return esAccesoTotal() || esJefeVentas();
    }

    public boolean puedeGestionarProductos() {
        return esAccesoTotal();
    }

    public boolean puedeGestionarPrecios() {
        return esAccesoTotal();
    }

    public boolean puedeGestionarUsuarios() {
        return esAccesoTotal();
    }

    public boolean puedeVerTodosLosVendedores() {
        return esAccesoTotal() || esJefeVentas();
    }

    public Integer obtenerIdUsuarioAutenticado() {
        Usuario usuario = obtenerUsuarioAutenticado();
        if (usuario == null || usuario.idUsuario == null) {
            throw new AccessDeniedException("No se pudo identificar al usuario autenticado.");
        }
        return usuario.idUsuario;
    }

    public Usuario obtenerUsuarioAutenticado() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser user)) {
            return null;
        }
        return user.getUsuario();
    }

    public Integer vendedorPermitido(Integer idVendedorSolicitado) {
        return resolverFiltroVendedor(idVendedorSolicitado);
    }

    public Integer resolverFiltroVendedor(Integer idVendedorSolicitado) {
        if (esVendedor()) {
            return obtenerIdUsuarioAutenticado();
        }
        if (puedeVerTodosLosVendedores() && (idVendedorSolicitado == null || idVendedorSolicitado == 0)) {
            return null;
        }
        return idVendedorSolicitado;
    }

    public Integer vendedorParaCrearCliente(Integer idVendedorSolicitado) {
        if (esVendedor()) {
            return obtenerIdUsuarioAutenticado();
        }
        return idVendedorSolicitado;
    }

    public Integer vendedorParaCrearCotizacion(Integer idVendedorSolicitado) {
        if (esVendedor()) {
            Integer idUsuario = obtenerIdUsuarioAutenticado();
            if (idVendedorSolicitado != null && !idUsuario.equals(idVendedorSolicitado)) {
                throw forbidden();
            }
            return idUsuario;
        }
        return idVendedorSolicitado;
    }

    @Transactional(readOnly = true)
    public void validarPuedeEditarCliente(Integer idCliente) {
        if (puedeGestionarClientes()) {
            return;
        }
        Cliente cliente = clienteRepository.findById(idCliente)
                .orElseThrow(() -> new ResourceNotFoundException("Cliente", idCliente));
        if (esVendedor() && perteneceAlVendedor(cliente, obtenerIdUsuarioAutenticado())) {
            return;
        }
        throw forbidden();
    }

    public void validarPuedeCambiarEstadoCliente() {
        if (!puedeGestionarClientes()) {
            throw forbidden();
        }
    }

    @Transactional(readOnly = true)
    public void validarPuedeVerCotizacion(Integer idCotizacion) {
        if (!esVendedor()) {
            return;
        }
        Cotizacion cotizacion = cotizacionRepository.findById(idCotizacion)
                .orElseThrow(() -> new ResourceNotFoundException("Cotizacion", idCotizacion));
        if (!perteneceAlVendedor(cotizacion, obtenerIdUsuarioAutenticado())) {
            throw forbidden();
        }
    }

    @Transactional(readOnly = true)
    public void validarPuedeGestionarCotizacion(Integer idCotizacion) {
        validarPuedeVerCotizacion(idCotizacion);
    }

    public void validarPuedeGestionarProductos() {
        if (!puedeGestionarProductos()) {
            throw forbidden();
        }
    }

    public void validarPuedeGestionarPrecios() {
        if (!puedeGestionarPrecios()) {
            throw forbidden();
        }
    }

    private boolean perteneceAlVendedor(Cliente cliente, Integer idUsuario) {
        Integer idVendedor = cliente.vendedorAsignado != null
                ? cliente.vendedorAsignado.idUsuario
                : cliente.idVendedorAsignado;
        return idUsuario != null && idUsuario.equals(idVendedor);
    }

    private boolean perteneceAlVendedor(Cotizacion cotizacion, Integer idUsuario) {
        Integer idVendedor = cotizacion.vendedor == null ? null : cotizacion.vendedor.idUsuario;
        return idUsuario != null && idUsuario.equals(idVendedor);
    }

    private boolean hasAuthority(String authority) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null
                && authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(authority::equals);
    }

    private boolean hasAnyAuthority(Set<String> authorities) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null
                && authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(authorities::contains);
    }

    private AccessDeniedException forbidden() {
        return new AccessDeniedException("No tienes permisos para acceder a este recurso.");
    }
}
