import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, forkJoin, of } from 'rxjs';
import { VendedorResponse } from '../../core/auth/models/auth.models';
import { PermissionService } from '../../core/auth/services/permission.service';
import { ClienteResponse, ProductoResponse } from '../../core/models/domain.models';
import { CatalogoItem } from '../../core/models/v1.models';
import { CatalogoV1Service } from '../../core/services/catalogo-v1.service';
import { DomainApiService } from '../../core/services/domain-api.service';
import { FileDownloadService } from '../../core/services/file-download.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { MaterialModule } from '../../shared/material/material.module';
import { ReporteCodigo, ReporteFiltro, ReporteFiltroKey, ReporteTipo } from './models/reporte.model';
import { ReporteService } from './services/reporte.service';

interface ReporteCatalogos {
  estadosCotizacion: CatalogoItem[];
  estadosProducto: CatalogoItem[];
  tiposCliente: CatalogoItem[];
  clientes: ClienteResponse[];
  productos: ProductoResponse[];
  vendedores: VendedorResponse[];
}

const REPORTES: ReporteTipo[] = [
  {
    codigo: 'cotizaciones',
    nombre: 'Cotizaciones',
    descripcion: 'Cotizaciones generadas, aprobadas, vencidas, rechazadas o anuladas.',
    icono: 'request_quote',
    categoria: 'Comercial',
    filtros: ['fechaInicio', 'fechaFin', 'idEstadoCotizacion', 'idCliente', 'idVendedor', 'idProducto', 'moneda', 'search'],
    fileName: 'reporte_cotizaciones.xlsx',
  },
  {
    codigo: 'cotizaciones-detalle',
    nombre: 'Detalle de cotizaciones',
    descripcion: 'Productos cotizados por cada cotizacion, precios e importes.',
    icono: 'receipt_long',
    categoria: 'Comercial',
    filtros: ['fechaInicio', 'fechaFin', 'idEstadoCotizacion', 'idCliente', 'idVendedor', 'idProducto', 'moneda'],
    fileName: 'reporte_cotizaciones_detalle.xlsx',
  },
  {
    codigo: 'vendedores',
    nombre: 'Desempeno por vendedor',
    descripcion: 'Actividad comercial, aprobaciones, vencimientos y tasa de conversion.',
    icono: 'leaderboard',
    categoria: 'Comercial',
    filtros: ['fechaInicio', 'fechaFin', 'idVendedor', 'idEstadoCotizacion'],
    fileName: 'reporte_vendedores.xlsx',
  },
  {
    codigo: 'clientes',
    nombre: 'Clientes',
    descripcion: 'Cartera de clientes, ubicacion, tipo y vendedor asignado.',
    icono: 'business',
    categoria: 'Clientes',
    filtros: ['idTipoCliente', 'idVendedor', 'departamento', 'provincia', 'distrito', 'search'],
    fileName: 'reporte_clientes.xlsx',
  },
  {
    codigo: 'clientes-top',
    nombre: 'Clientes top',
    descripcion: 'Clientes con mayor valor comercial y cantidad de cotizaciones.',
    icono: 'domain',
    categoria: 'Clientes',
    filtros: ['fechaInicio', 'fechaFin', 'idTipoCliente', 'idVendedor', 'idEstadoCotizacion'],
    fileName: 'reporte_clientes_top.xlsx',
  },
  {
    codigo: 'productos',
    nombre: 'Productos',
    descripcion: 'Catalogo de productos con stock, medidas y estados.',
    icono: 'science',
    categoria: 'Productos y stock',
    filtros: ['idProducto', 'idEstadoProducto', 'stockBajo', 'search'],
    fileName: 'reporte_productos.xlsx',
  },
  {
    codigo: 'stock',
    nombre: 'Stock',
    descripcion: 'Stock fisico, reservado, disponible y alertas de stock bajo.',
    icono: 'inventory_2',
    categoria: 'Productos y stock',
    filtros: ['idProducto', 'idEstadoProducto', 'stockBajo', 'search'],
    fileName: 'reporte_stock.xlsx',
  },
  {
    codigo: 'precios-tipo-cliente',
    nombre: 'Precios por tipo de cliente',
    descripcion: 'Precios configurados por producto, moneda y tipo de cliente.',
    icono: 'price_change',
    categoria: 'Productos y stock',
    filtros: ['idProducto', 'idTipoCliente', 'idEstadoProducto', 'moneda'],
    fileName: 'reporte_precios_tipo_cliente.xlsx',
  },
  {
    codigo: 'productos-mas-cotizados',
    nombre: 'Productos mas cotizados',
    descripcion: 'Ranking de productos con mayor demanda comercial.',
    icono: 'trending_up',
    categoria: 'Productos y stock',
    filtros: ['fechaInicio', 'fechaFin', 'idEstadoCotizacion', 'moneda'],
    fileName: 'reporte_productos_mas_cotizados.xlsx',
  },
];

@Component({
  selector: 'app-reportes',
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, PageHeaderComponent, EmptyStateComponent],
  templateUrl: './reportes.component.html',
  styleUrl: './reportes.component.scss',
})
export class ReportesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly reporteService = inject(ReporteService);
  private readonly fileDownload = inject(FileDownloadService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly catalogoService = inject(CatalogoV1Service);
  private readonly domainApi = inject(DomainApiService);
  readonly permissions = inject(PermissionService);

  readonly reportes = REPORTES;
  readonly selectedCode = signal<ReporteCodigo>('cotizaciones');
  readonly exporting = signal(false);
  readonly catalogos = signal<ReporteCatalogos>({
    estadosCotizacion: [],
    estadosProducto: [],
    tiposCliente: [],
    clientes: [],
    productos: [],
    vendedores: [],
  });

  readonly selectedReporte = computed(() => this.reportes.find((item) => item.codigo === this.selectedCode()) ?? this.reportes[0]);

  readonly filtros = this.fb.group({
    fechaInicio: [''],
    fechaFin: [''],
    idEstadoCotizacion: [''],
    idCliente: [''],
    idVendedor: [''],
    idProducto: [''],
    idTipoCliente: [''],
    idEstadoProducto: [''],
    moneda: [''],
    departamento: [''],
    provincia: [''],
    distrito: [''],
    stockBajo: [''],
    search: [''],
  });

  constructor() {
    this.loadCatalogos();
  }

  selectReporte(codigo: ReporteCodigo): void {
    this.selectedCode.set(codigo);
  }

  hasFilter(filter: ReporteFiltroKey): boolean {
    return this.selectedReporte().filtros.includes(filter);
  }

  limpiarFiltros(): void {
    this.filtros.reset({
      fechaInicio: '',
      fechaFin: '',
      idEstadoCotizacion: '',
      idCliente: '',
      idVendedor: '',
      idProducto: '',
      idTipoCliente: '',
      idEstadoProducto: '',
      moneda: '',
      departamento: '',
      provincia: '',
      distrito: '',
      stockBajo: '',
      search: '',
    });
  }

  exportar(): void {
    const reporte = this.selectedReporte();
    this.exporting.set(true);
    this.reporteService.exportar(reporte.codigo, this.buildFilter()).subscribe({
      next: (blob) => {
        this.fileDownload.downloadBlob(blob, reporte.fileName);
        this.snackBar.open('Reporte exportado correctamente.', 'Cerrar', { duration: 3500 });
      },
      error: () => {
        this.snackBar.open('No se pudo generar el reporte. Intenta nuevamente.', 'Cerrar', { duration: 4500 });
        this.exporting.set(false);
      },
      complete: () => this.exporting.set(false),
    });
  }

  nombreUsuario(usuario: VendedorResponse): string {
    return usuario.nombreCompleto || [usuario.nombres, usuario.apellidoPaterno, usuario.apellidoMaterno].filter(Boolean).join(' ');
  }

  private loadCatalogos(): void {
    forkJoin({
      estadosCotizacion: this.catalogoService.estadosCotizacion().pipe(catchError(() => of([]))),
      estadosProducto: this.catalogoService.estadosProducto().pipe(catchError(() => of([]))),
      tiposCliente: this.catalogoService.tiposClienteActivos().pipe(catchError(() => of([]))),
      clientes: this.domainApi.getClientes().pipe(catchError(() => of([]))),
      productos: this.domainApi.getProductos().pipe(catchError(() => of([]))),
      vendedores: this.permissions.canViewAllSellers()
        ? this.domainApi.getVendedores().pipe(catchError(() => of([])))
        : of([]),
    }).subscribe((catalogos) => this.catalogos.set(catalogos));
  }

  private buildFilter(): ReporteFiltro {
    const value = this.filtros.getRawValue();
    return {
      fechaInicio: value.fechaInicio || undefined,
      fechaFin: value.fechaFin || undefined,
      idEstadoCotizacion: this.toNumber(value.idEstadoCotizacion),
      idCliente: this.toNumber(value.idCliente),
      idVendedor: this.permissions.canViewAllSellers() ? this.toNumber(value.idVendedor) : undefined,
      idProducto: this.toNumber(value.idProducto),
      idTipoCliente: this.toNumber(value.idTipoCliente),
      idEstadoProducto: this.toNumber(value.idEstadoProducto),
      moneda: value.moneda || undefined,
      departamento: value.departamento || undefined,
      provincia: value.provincia || undefined,
      distrito: value.distrito || undefined,
      stockBajo: value.stockBajo === '' || value.stockBajo === null ? undefined : value.stockBajo === 'true',
      search: value.search || undefined,
    };
  }

  private toNumber(value: string | number | null | undefined): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    return Number(value);
  }
}
