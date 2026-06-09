import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { VendedorResponse } from '../../core/auth/models/auth.models';
import { CatalogoItem } from '../../core/models/v1.models';
import { CatalogoV1Service } from '../../core/services/catalogo-v1.service';
import { DomainApiService } from '../../core/services/domain-api.service';
import { ClienteResponse, ProductoResponse } from '../../core/models/domain.models';
import { PermissionService } from '../../core/auth/services/permission.service';
import { MaterialModule } from '../../shared/material/material.module';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import {
  CotizacionPorEstadoResponse,
  CotizacionPorVendedorResponse,
  CotizacionTendenciaResponse,
  DashboardFilter,
  DashboardResumenResponse,
  ProductoStockBajoResponse,
  StockProductoDashboardResponse,
  TopClienteResponse,
  TopProductoResponse,
} from './models/dashboard.model';
import { DashboardService } from './services/dashboard.service';

type Periodo = 'TODAY' | 'LAST_7' | 'LAST_30' | 'MONTH' | 'CUSTOM';

interface DashboardData {
  resumen: DashboardResumenResponse;
  tendencia: CotizacionTendenciaResponse[];
  estados: CotizacionPorEstadoResponse[];
  topProductos: TopProductoResponse[];
  topClientes: TopClienteResponse[];
  vendedores: CotizacionPorVendedorResponse[];
  stockProductos: StockProductoDashboardResponse[];
  stockBajo: ProductoStockBajoResponse[];
}

interface DashboardCatalogos {
  estados: CatalogoItem[];
  tiposCliente: CatalogoItem[];
  clientes: ClienteResponse[];
  productos: ProductoResponse[];
  vendedores: VendedorResponse[];
}

const EMPTY_RESUMEN: DashboardResumenResponse = {
  totalCotizaciones: 0,
  cotizacionesGeneradas: 0,
  cotizacionesAprobadas: 0,
  cotizacionesVencidas: 0,
  cotizacionesRechazadas: 0,
  cotizacionesAnuladas: 0,
  tasaConversion: 0,
  importeTotalCotizado: 0,
  importeTotalAprobado: 0,
  ticketPromedio: 0,
  clientesAtendidos: 0,
  productosCotizados: 0,
  stockTotalFisico: 0,
  stockTotalReservado: 0,
  stockTotalDisponible: 0,
  productosStockBajo: 0,
};

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, PageHeaderComponent, KpiCardComponent, EmptyStateComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly dashboardService = inject(DashboardService);
  private readonly domainApi = inject(DomainApiService);
  private readonly catalogoService = inject(CatalogoV1Service);
  readonly permissions = inject(PermissionService);
  private readonly fb = inject(FormBuilder);
  readonly data = signal<DashboardData | null>(null);
  readonly catalogos = signal<DashboardCatalogos>({
    estados: [],
    tiposCliente: [],
    clientes: [],
    productos: [],
    vendedores: [],
  });
  readonly loading = signal(false);
  readonly error = signal('');

  readonly filters = this.fb.group({
    periodo: ['LAST_30' as Periodo],
    fechaInicio: [''],
    fechaFin: [''],
    idEstadoCotizacion: [''],
    idVendedor: [''],
    idCliente: [''],
    idProducto: [''],
    idTipoCliente: [''],
    moneda: [''],
  });

  constructor() {
    this.loadCatalogos();
    this.load();
    this.filters.controls.periodo.valueChanges.subscribe((periodo) => {
      if (periodo && periodo !== 'CUSTOM') {
        const range = this.resolveDateRange(periodo);
        this.filters.patchValue(range, { emitEvent: false });
      }
    });
  }

  load(): void {
    this.error.set('');
    this.loading.set(true);
    const filters = this.buildFilters();

    forkJoin({
      resumen: this.dashboardService.resumen(filters).pipe(catchError(() => of(EMPTY_RESUMEN))),
      tendencia: this.dashboardService.cotizacionesTendencia(filters).pipe(catchError(() => of([]))),
      estados: this.dashboardService.cotizacionesPorEstado(filters).pipe(catchError(() => of([]))),
      topProductos: this.dashboardService.topProductos(filters).pipe(catchError(() => of([]))),
      topClientes: this.dashboardService.topClientes(filters).pipe(catchError(() => of([]))),
      vendedores: this.dashboardService.cotizacionesPorVendedor(filters).pipe(catchError(() => of([]))),
      stockProductos: this.dashboardService.stockProductos(filters).pipe(catchError(() => of([]))),
      stockBajo: this.dashboardService.productosStockBajo(filters).pipe(catchError(() => of([]))),
    }).subscribe({
      next: (data) => this.data.set(data),
      error: () => {
        this.error.set('No se pudieron cargar los indicadores del dashboard.');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }

  limpiarFiltros(): void {
    this.filters.reset({
      periodo: 'LAST_30',
      fechaInicio: '',
      fechaFin: '',
      idEstadoCotizacion: '',
      idVendedor: '',
      idCliente: '',
      idProducto: '',
      idTipoCliente: '',
      moneda: '',
    });
    this.load();
  }

  formatCurrency(value: number | null | undefined, moneda = 'PEN'): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: moneda || 'PEN',
      maximumFractionDigits: 2,
    }).format(value ?? 0);
  }

  percent(value: number | null | undefined): string {
    return `${Math.round((value ?? 0) * 100) / 100}%`;
  }

  barWidth(value: number, max: number): string {
    if (!max) {
      return '0%';
    }
    return `${Math.max(6, Math.round((value / max) * 100))}%`;
  }

  maxOf<T>(items: T[], selector: (item: T) => number): number {
    return Math.max(0, ...items.map(selector));
  }

  maxTendencia(items: CotizacionTendenciaResponse[]): number {
    return this.maxOf(items, (item) => item.totalCotizaciones);
  }

  maxEstados(items: CotizacionPorEstadoResponse[]): number {
    return this.maxOf(items, (item) => item.cantidad);
  }

  maxProductos(items: TopProductoResponse[]): number {
    return this.maxOf(items, (item) => item.importeTotal);
  }

  maxClientes(items: TopClienteResponse[]): number {
    return this.maxOf(items, (item) => item.importeTotal);
  }

  maxVendedores(items: CotizacionPorVendedorResponse[]): number {
    return this.maxOf(items, (item) => item.importeTotal);
  }

  maxStock(items: StockProductoDashboardResponse[]): number {
    return this.maxOf(items, (item) => item.stockDisponible);
  }

  nombreUsuario(usuario: VendedorResponse): string {
    return usuario.nombreCompleto || [usuario.nombres, usuario.apellidoPaterno, usuario.apellidoMaterno].filter(Boolean).join(' ');
  }

  faltante(producto: ProductoStockBajoResponse): number {
    return Math.max(0, producto.stockMinimo - producto.stockDisponible);
  }

  filtrosActivos(): number {
    return this.activeFilterCount();
  }

  private loadCatalogos(): void {
    forkJoin({
      estados: this.catalogoService.estadosCotizacion().pipe(catchError(() => of([]))),
      tiposCliente: this.catalogoService.tiposClienteActivos().pipe(catchError(() => of([]))),
      clientes: this.domainApi.getClientes().pipe(catchError(() => of([]))),
      productos: this.domainApi.getProductos().pipe(catchError(() => of([]))),
      vendedores: this.permissions.canViewAllSellers()
        ? this.domainApi.getVendedores().pipe(catchError(() => of([])))
        : of([]),
    }).subscribe({
      next: (catalogos) => this.catalogos.set(catalogos),
    });
  }

  private buildFilters(): DashboardFilter {
    const value = this.filters.getRawValue();
    const range = this.resolveDateRange(value.periodo ?? 'LAST_30');
    const fechaInicio = value.periodo === 'CUSTOM' ? value.fechaInicio : range.fechaInicio;
    const fechaFin = value.periodo === 'CUSTOM' ? value.fechaFin : range.fechaFin;

    return {
      fechaInicio: fechaInicio || undefined,
      fechaFin: fechaFin || undefined,
      idEstadoCotizacion: this.toNumber(value.idEstadoCotizacion),
      idVendedor: this.toNumber(value.idVendedor),
      idCliente: this.toNumber(value.idCliente),
      idProducto: this.toNumber(value.idProducto),
      idTipoCliente: this.toNumber(value.idTipoCliente),
      moneda: value.moneda || undefined,
    };
  }

  private resolveDateRange(periodo: Periodo): { fechaInicio: string; fechaFin: string } {
    const today = new Date();
    const start = new Date(today);

    if (periodo === 'TODAY') {
      return { fechaInicio: this.toDateInput(today), fechaFin: this.toDateInput(today) };
    }

    if (periodo === 'LAST_7') {
      start.setDate(today.getDate() - 6);
      return { fechaInicio: this.toDateInput(start), fechaFin: this.toDateInput(today) };
    }

    if (periodo === 'MONTH') {
      start.setDate(1);
      return { fechaInicio: this.toDateInput(start), fechaFin: this.toDateInput(today) };
    }

    if (periodo === 'CUSTOM') {
      return {
        fechaInicio: this.filters.controls.fechaInicio.value ?? '',
        fechaFin: this.filters.controls.fechaFin.value ?? '',
      };
    }

    start.setDate(today.getDate() - 29);
    return { fechaInicio: this.toDateInput(start), fechaFin: this.toDateInput(today) };
  }

  private toDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toNumber(value: string | number | null | undefined): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    return Number(value);
  }

  private activeFilterCount(): number {
    const value = this.filters.getRawValue();
    return [
      value.idEstadoCotizacion,
      value.idVendedor,
      value.idCliente,
      value.idProducto,
      value.idTipoCliente,
      value.moneda,
    ].filter(Boolean).length;
  }
}
