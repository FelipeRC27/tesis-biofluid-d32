package com.example.demo.service;

import com.example.demo.dto.UsuarioRequest;
import com.example.demo.dto.UsuarioResponse;
import com.example.demo.dto.VendedorResponse;
import com.example.demo.exception.BusinessValidationException;
import com.example.demo.exception.ResourceNotFoundException;
import com.example.demo.mapper.UsuarioMapper;
import com.example.demo.model.EstadoUsuario;
import com.example.demo.model.Perfil;
import com.example.demo.model.TipoDocumento;
import com.example.demo.model.Usuario;
import com.example.demo.repository.EstadoUsuarioRepository;
import com.example.demo.repository.PerfilRepository;
import com.example.demo.repository.TipoDocumentoRepository;
import com.example.demo.repository.UsuarioRepository;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UsuarioService extends CrudService<Usuario, Integer> {
    private final UsuarioRepository usuarioRepository;
    private final PerfilRepository perfilRepository;
    private final TipoDocumentoRepository tipoDocumentoRepository;
    private final EstadoUsuarioRepository estadoUsuarioRepository;
    private final UsuarioMapper mapper;
    private final PasswordEncoder passwordEncoder;
    private final AuditoriaService auditoriaService;

    public UsuarioService(
            UsuarioRepository repository,
            PerfilRepository perfilRepository,
            TipoDocumentoRepository tipoDocumentoRepository,
            EstadoUsuarioRepository estadoUsuarioRepository,
            UsuarioMapper mapper,
            PasswordEncoder passwordEncoder,
            AuditoriaService auditoriaService
    ) {
        super(repository, "Usuario");
        this.usuarioRepository = repository;
        this.perfilRepository = perfilRepository;
        this.tipoDocumentoRepository = tipoDocumentoRepository;
        this.estadoUsuarioRepository = estadoUsuarioRepository;
        this.mapper = mapper;
        this.passwordEncoder = passwordEncoder;
        this.auditoriaService = auditoriaService;
    }

    @Override
    protected Integer parseId(String id) {
        return parseIntegerId(id);
    }

    @Transactional(readOnly = true)
    public List<UsuarioResponse> findAllDto() {
        return usuarioRepository.findAll().stream().map(mapper::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public UsuarioResponse findDtoById(Integer id) {
        return mapper.toResponse(findUsuario(id));
    }

    @Transactional(readOnly = true)
    public List<VendedorResponse> findVendedoresHabilitados() {
        return usuarioRepository.findVendedoresHabilitados().stream()
                .map(this::toVendedorResponse)
                .toList();
    }

    @Transactional
    public UsuarioResponse create(UsuarioRequest request, String usuarioLogeado) {
        validateUnique(request.correo(), request.nroDocumento(), null);
        if (request.passwordHash() == null || request.passwordHash().isBlank()) {
            throw validation("passwordHash", "La contrasena es obligatoria para crear el usuario.");
        }
        Usuario usuario = mapper.toEntity(
                withEncodedPassword(request),
                findPerfil(request.idPerfil()),
                findTipoDocumento(request.idTipoDoc()),
                findEstadoUsuario(request.idEstado())
        );
        usuario.intentosFallidos = request.intentosFallidos() == null ? 0 : request.intentosFallidos();
        usuario.fechaRegistro = LocalDateTime.now();
        usuario.usuarioRegistro = usuarioLogeado;
        usuario.usuarioActualiza = null;
        usuario.fechaActualiza = null;
        UsuarioResponse response = mapper.toResponse(usuarioRepository.save(usuario));
        auditoriaService.registrarCreacion("USUARIO", String.valueOf(response.idUsuario()), response, "USUARIOS", "Creacion de usuario");
        return response;
    }

    @Transactional
    public UsuarioResponse update(Integer id, UsuarioRequest request, String usuarioLogeado) {
        Usuario usuario = findUsuario(id);
        UsuarioResponse anterior = mapper.toResponse(usuario);
        validateUnique(request.correo(), request.nroDocumento(), id);
        mapper.updateEntity(
                usuario,
                request.passwordHash() == null || request.passwordHash().isBlank() ? request : withEncodedPassword(request),
                findPerfil(request.idPerfil()),
                findTipoDocumento(request.idTipoDoc()),
                findEstadoUsuario(request.idEstado())
        );
        usuario.fechaActualiza = LocalDateTime.now();
        usuario.usuarioActualiza = usuarioLogeado;
        UsuarioResponse nuevo = mapper.toResponse(usuarioRepository.save(usuario));
        String accion = request.idEstado() != null && anterior.estado() != null && !request.idEstado().equals(anterior.estado().id())
                ? "CHANGE_STATUS"
                : "UPDATE";
        auditoriaService.registrarAccion("USUARIO", String.valueOf(id), accion, anterior, nuevo, "USUARIOS", "Actualizacion de usuario");
        return nuevo;
    }

    private UsuarioRequest withEncodedPassword(UsuarioRequest request) {
        return new UsuarioRequest(
                request.idPerfil(),
                request.idTipoDoc(),
                request.nroDocumento(),
                request.nombres(),
                request.apellidoPaterno(),
                request.apellidoMaterno(),
                request.correo(),
                request.celular(),
                passwordEncoder.encode(request.passwordHash()),
                request.intentosFallidos(),
                request.idEstado(),
                null,
                null
        );
    }

    private void validateUnique(String correo, String nroDocumento, Integer currentId) {
        Map<String, List<String>> fields = new LinkedHashMap<>();
        usuarioRepository.findByCorreo(correo).ifPresent(usuario -> {
            if (!usuario.idUsuario.equals(currentId)) {
                fields.put("correo", List.of("Ya existe un usuario con ese correo."));
            }
        });
        usuarioRepository.findAll().stream()
                .filter(usuario -> usuario.nroDocumento != null && usuario.nroDocumento.equals(nroDocumento))
                .findFirst()
                .ifPresent(usuario -> {
                    if (!usuario.idUsuario.equals(currentId)) {
                        fields.put("nroDocumento", List.of("Ya existe un usuario con ese documento."));
                    }
                });
        if (!fields.isEmpty()) {
            throw new BusinessValidationException("No se pudo guardar el usuario.", fields);
        }
    }

    private BusinessValidationException validation(String field, String message) {
        Map<String, List<String>> fields = new LinkedHashMap<>();
        fields.put(field, List.of(message));
        return new BusinessValidationException(message, fields);
    }

    private Usuario findUsuario(Integer id) {
        return usuarioRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", id));
    }

    private VendedorResponse toVendedorResponse(Usuario usuario) {
        return new VendedorResponse(
                usuario.idUsuario,
                usuario.nombres,
                usuario.apellidoPaterno,
                usuario.apellidoMaterno,
                fullName(usuario),
                usuario.correo
        );
    }

    private String fullName(Usuario usuario) {
        return String.join(" ",
                safe(usuario.nombres),
                safe(usuario.apellidoPaterno),
                safe(usuario.apellidoMaterno)
        ).trim();
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private Perfil findPerfil(Integer id) {
        return perfilRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Perfil", id));
    }

    private TipoDocumento findTipoDocumento(Integer id) {
        return tipoDocumentoRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("TipoDocumento", id));
    }

    private EstadoUsuario findEstadoUsuario(Integer id) {
        return estadoUsuarioRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("EstadoUsuario", id));
    }
}
