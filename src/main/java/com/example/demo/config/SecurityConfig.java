package com.example.demo.config;

import com.example.demo.security.TokenAuthenticationFilter;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            TokenAuthenticationFilter tokenAuthenticationFilter,
            AuthenticationProvider authenticationProvider
    ) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authenticationProvider(authenticationProvider)
                .exceptionHandling(exception -> exception
                        .authenticationEntryPoint((request, response, authException) -> {
                            response.setStatus(HttpStatus.UNAUTHORIZED.value());
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.getWriter().write("""
                                    {"status":401,"error":"Unauthorized","message":"Token ausente o invalido."}
                                    """);
                        })
                        .accessDeniedHandler((request, response, accessDeniedException) -> {
                            response.setStatus(HttpStatus.FORBIDDEN.value());
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.getWriter().write("""
                                    {"status":403,"error":"Forbidden","message":"No tienes permisos para acceder a este recurso."}
                                    """);
                        })
                )
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/auth/login").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/perfiles", "/api/perfiles/*")
                        .hasAnyRole("SISTEMAS", "GERENTE", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/perfiles")
                        .hasAnyRole("SISTEMAS", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/perfiles/*")
                        .hasAnyRole("SISTEMAS", "ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/perfiles/*")
                        .hasAnyRole("SISTEMAS", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/tipos-documento", "/api/tipos-documento/*")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/tipos-documento")
                        .hasAnyRole("SISTEMAS", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/tipos-documento/*")
                        .hasAnyRole("SISTEMAS", "ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/tipos-documento/*")
                        .hasAnyRole("SISTEMAS", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/productos", "/api/v1/productos/*")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/productos")
                        .hasAnyRole("SISTEMAS", "GERENTE", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/v1/productos/*")
                        .hasAnyRole("SISTEMAS", "GERENTE", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/productos/*/estado")
                        .hasAnyRole("SISTEMAS", "GERENTE", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/tipos-cliente", "/api/v1/tipos-cliente/*", "/api/v1/tipos-cliente/activos")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/tipos-cliente")
                        .hasAnyRole("SISTEMAS", "JEFE_VENTAS", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/v1/tipos-cliente/*")
                        .hasAnyRole("SISTEMAS", "JEFE_VENTAS", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/tipos-cliente/*/estado")
                        .hasAnyRole("SISTEMAS", "JEFE_VENTAS", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/tipos-cliente/*")
                        .hasAnyRole("SISTEMAS", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/precios-tipo-cliente", "/api/v1/precios-tipo-cliente/*", "/api/v1/precios-tipo-cliente/producto/*", "/api/v1/precios-tipo-cliente/buscar")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/precios-tipo-cliente")
                        .hasAnyRole("SISTEMAS", "GERENTE", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/v1/precios-tipo-cliente/*")
                        .hasAnyRole("SISTEMAS", "GERENTE", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/clientes", "/api/v1/clientes/*", "/api/v1/clientes/buscar")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/ubigeos/**")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/clientes")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/v1/clientes/*", "/api/v1/clientes/*")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/clientes/*/estado")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/clientes/*")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/cotizaciones", "/api/v1/cotizaciones/*", "/api/v1/cotizaciones/*/pdf")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/dashboard/**")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/auditoria/**")
                        .hasAnyRole("SISTEMAS", "GERENTE", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/reportes/**")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/cotizaciones", "/api/v1/cotizaciones/calcular-item", "/api/v1/cotizaciones/calcular-resumen", "/api/v1/cotizaciones/*/generar-pdf")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/cotizaciones/procesar-vencidas")
                        .hasAnyRole("SISTEMAS", "GERENTE", "ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/cotizaciones/*/estado")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/cotizacion-detalles", "/api/cotizacion-detalles/*")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/cotizacion-detalles")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/cotizacion-detalles/*")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "VENDEDOR", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/cotizacion-detalles/*")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/usuarios/vendedores")
                        .hasAnyRole("SISTEMAS", "GERENTE", "JEFE_VENTAS", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/usuarios")
                        .hasAnyRole("SISTEMAS", "GERENTE", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/usuarios/*")
                        .hasAnyRole("SISTEMAS", "GERENTE", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/usuarios")
                        .hasAnyRole("SISTEMAS", "GERENTE", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/usuarios/*")
                        .hasAnyRole("SISTEMAS", "GERENTE", "ADMINISTRATIVO", "ADMIN")
                        .requestMatchers("/api/estados/**").hasAnyRole("ADMIN", "ADMINISTRADOR")
                        .requestMatchers(
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/v3/api-docs",
                                "/v3/api-docs/**"
                        ).permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll()
                )
                .addFilterBefore(tokenAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public AuthenticationProvider authenticationProvider(
            UserDetailsService userDetailsService,
            PasswordEncoder passwordEncoder
    ) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return provider;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(
                "http://localhost:3000",
                "http://localhost:5173",
                "http://localhost:4200"
        ));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }
}
