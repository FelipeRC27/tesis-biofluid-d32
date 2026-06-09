import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { UbigeoCoberturaResponse, UbigeoResponse } from '../models/ubigeo-inei.models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class UbigeoIneiService {
  private readonly api = inject(ApiService);
  private readonly basePath = API_ENDPOINTS.v1.ubigeos;

  listarDepartamentos(): Observable<string[]> {
    return this.api.get<string[]>(`${this.basePath}/departamentos`);
  }

  listarProvincias(departamento: string): Observable<string[]> {
    return this.api.get<string[]>(`${this.basePath}/provincias`, { departamento });
  }

  listarDistritos(departamento: string, provincia: string): Observable<string[]> {
    return this.api.get<string[]>(`${this.basePath}/distritos`, { departamento, provincia });
  }

  consultarCodigoUbigeo(departamento: string, provincia: string, distrito: string): Observable<UbigeoResponse> {
    return this.api.get<UbigeoResponse>(`${this.basePath}/codigo`, { departamento, provincia, distrito });
  }

  consultarCoberturaPorUbigeo(ubigeo: string): Observable<UbigeoCoberturaResponse> {
    return this.api.get<UbigeoCoberturaResponse>(`${this.basePath}/${ubigeo}/cobertura`);
  }
}
