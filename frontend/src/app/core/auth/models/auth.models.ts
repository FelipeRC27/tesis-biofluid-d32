import { ReferenceResponse } from '../../http/reference-response.model';

export interface LoginRequest {
  correo: string;
  password: string;
}

export interface UsuarioResponse {
  idUsuario: number;
  perfil: ReferenceResponse;
  tipoDocumento: ReferenceResponse;
  nroDocumento: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  correo: string;
  celular?: string;
  intentosFallidos: number;
  estado: ReferenceResponse;
  usuarioRegistro?: string | null;
  fechaRegistro?: string;
  usuarioActualiza?: string | null;
  fechaActualiza?: string;
}

export interface VendedorResponse {
  idUsuario: number;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  nombreCompleto: string;
  correo: string;
}

export interface UsuarioRequest {
  idPerfil: number;
  idTipoDoc: number;
  nroDocumento: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  correo: string;
  celular?: string;
  passwordHash?: string;
  intentosFallidos: number;
  idEstado: number;
  usuarioRegistro?: string | null;
  usuarioActualiza?: string | null;
}

export interface AuthResponse {
  tokenType: string;
  accessToken: string;
  expiresInSeconds: number;
  usuario: UsuarioResponse;
}
