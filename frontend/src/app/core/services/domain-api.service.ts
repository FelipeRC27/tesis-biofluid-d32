import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { UsuarioRequest, UsuarioResponse, VendedorResponse } from '../auth/models/auth.models';
import { ReferenceResponse } from '../http/reference-response.model';
import { ApiService, QueryParams } from './api.service';
import {
  ClienteRequest,
  ClienteResponse,
  CotizacionResponse,
  DashboardKpis,
  ProductoResponse,
} from '../models/domain.models';

@Injectable({ providedIn: 'root' })
export class DomainApiService {
  private readonly api = inject(ApiService);

  getClientes(params?: QueryParams): Observable<ClienteResponse[]> {
    return this.api.get<ClienteResponse[]>(API_ENDPOINTS.v1.clientes, params);
  }

  createCliente(request: ClienteRequest): Observable<ClienteResponse> {
    return this.api.post<ClienteResponse>(API_ENDPOINTS.v1.clientes, request);
  }

  updateCliente(id: number, request: ClienteRequest): Observable<ClienteResponse> {
    return this.api.put<ClienteResponse>(`${API_ENDPOINTS.v1.clientes}/${id}`, request);
  }

  getUsuarios(): Observable<UsuarioResponse[]> {
    return this.api.get<UsuarioResponse[]>(API_ENDPOINTS.usuarios);
  }

  getVendedores(): Observable<VendedorResponse[]> {
    return this.api.get<VendedorResponse[]>(API_ENDPOINTS.usuariosVendedores);
  }

  createUsuario(request: UsuarioRequest): Observable<UsuarioResponse> {
    return this.api.post<UsuarioResponse>(API_ENDPOINTS.usuarios, request);
  }

  updateUsuario(id: number, request: UsuarioRequest): Observable<UsuarioResponse> {
    return this.api.put<UsuarioResponse>(`${API_ENDPOINTS.usuarios}/${id}`, request);
  }

  getProductos(params?: QueryParams): Observable<ProductoResponse[]> {
    return this.api.get<ProductoResponse[]>(API_ENDPOINTS.v1.productos, params);
  }

  getCotizaciones(params?: QueryParams): Observable<CotizacionResponse[]> {
    return this.api.get<CotizacionResponse[]>(API_ENDPOINTS.v1.cotizaciones, params);
  }

  getPerfiles(): Observable<ReferenceResponse[]> {
    return this.api.get<ReferenceResponse[]>(API_ENDPOINTS.perfiles);
  }

  getDashboardKpis(): Observable<DashboardKpis> {
    // TODO backend: reemplazar por endpoint agregado /dashboard/kpis cuando exista.
    return forkJoin({
      cotizaciones: this.getCotizaciones(),
      productos: this.getProductos(),
    }).pipe(
      map(({ cotizaciones, productos }) => {
        const now = new Date();
        const today = now.toDateString();
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        const month = now.getMonth();
        const confirmed = cotizaciones.filter((item) => (item.estadoCotizacion ?? item.descEstadoCotizacion ?? '').toUpperCase() === 'CONFIRMADA');
        const vencidas = cotizaciones.filter((item) => new Date(item.fechaVencimiento) < now);
        const chatbot: CotizacionResponse[] = [];
        const tiempos: number[] = [];
        return {
          cotizacionesHoy: cotizaciones.filter((item) => new Date(item.fechaEmision).toDateString() === today).length,
          cotizacionesSemana: cotizaciones.filter((item) => new Date(item.fechaEmision) >= weekAgo).length,
          cotizacionesMes: cotizaciones.filter((item) => new Date(item.fechaEmision).getMonth() === month).length,
          tiempoPromedioRespuestaSegundos: tiempos.length
            ? Math.round(tiempos.reduce((sum, value) => sum + value, 0) / tiempos.length)
            : 0,
          cotizacionesChatbot: chatbot.length,
          cotizacionesManuales: cotizaciones.length - chatbot.length,
          cotizacionesVencidas: vencidas.length,
          cotizacionesConfirmadas: confirmed.length,
          stockFisico: productos.reduce((sum, item) => sum + (item.stockFisico ?? 0), 0),
          stockReservado: productos.reduce((sum, item) => sum + (item.stockReservado ?? 0), 0),
          stockDisponible: productos.reduce((sum, item) => sum + (item.stockDisponible ?? 0), 0),
          alertasStockBajo: productos.filter((item) => item.stockDisponible <= item.stockMinimo).length,
          pdfsGenerados: 0,
        };
      }),
    );
  }
}
