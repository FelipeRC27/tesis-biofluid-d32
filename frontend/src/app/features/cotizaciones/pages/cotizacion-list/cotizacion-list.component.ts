import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { debounceTime, distinctUntilChanged, filter, finalize, forkJoin, of } from 'rxjs';
import { VendedorResponse } from '../../../../core/auth/models/auth.models';
import { PermissionService } from '../../../../core/auth/services/permission.service';
import { CatalogoItem, ClienteV1 } from '../../../../core/models/v1.models';
import { CatalogoV1Service } from '../../../../core/services/catalogo-v1.service';
import { ClienteV1Service } from '../../../../core/services/cliente-v1.service';
import { DomainApiService } from '../../../../core/services/domain-api.service';
import { FileDownloadService } from '../../../../core/services/file-download.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../../shared/components/status-chip/status-chip.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { MaterialModule } from '../../../../shared/material/material.module';
import { CotizacionFilter, CotizacionResponse } from '../../models/cotizacion.model';
import { CotizacionService } from '../../services/cotizacion.service';

@Component({
  selector: 'app-cotizacion-list',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MaterialModule,
    PageHeaderComponent,
    EmptyStateComponent,
    StatusChipComponent,
  ],
  templateUrl: './cotizacion-list.component.html',
  styleUrl: './cotizacion-list.component.scss',
})
export class CotizacionListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CotizacionService);
  private readonly clienteService = inject(ClienteV1Service);
  private readonly catalogoService = inject(CatalogoV1Service);
  private readonly domainApi = inject(DomainApiService);
  private readonly downloads = inject(FileDownloadService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  readonly permissions = inject(PermissionService);

  readonly cotizaciones = signal<CotizacionResponse[]>([]);
  readonly filteredCotizaciones = signal<CotizacionResponse[]>([]);
  readonly clientes = signal<ClienteV1[]>([]);
  readonly vendedores = signal<VendedorResponse[]>([]);
  readonly estados = signal<CatalogoItem[]>([]);
  readonly isLoading = signal(false);
  readonly pdfLoadingId = signal<number | null>(null);
  readonly statusLoadingId = signal<number | null>(null);
  readonly dataSource = new MatTableDataSource<CotizacionResponse>([]);

  readonly columns = [
    'numero',
    'cliente',
    'ruc',
    'vendedor',
    'fechaEmision',
    'fechaVencimiento',
    'tiempoRestante',
    'moneda',
    'importeTotal',
    'estado',
    'pdf',
    'acciones',
  ];

  readonly filtersForm = this.fb.group({
    search: [''],
    idCliente: ['ALL'],
    idVendedor: ['ALL'],
    idEstadoCotizacion: ['ALL'],
    moneda: ['ALL'],
    fechaInicio: [''],
    fechaFin: [''],
  });

  @ViewChild(MatPaginator) paginator?: MatPaginator;
  @ViewChild(MatSort) sort?: MatSort;

  ngOnInit(): void {
    this.configureTable();
    this.loadCatalogs();
    this.loadCotizaciones();
    this.filtersForm.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)))
      .subscribe(() => this.loadCotizaciones());
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator ?? null;
    this.dataSource.sort = this.sort ?? null;
  }

  loadCatalogs(): void {
    forkJoin({
      clientes: this.clienteService.findAll(),
      vendedores: this.permissions.canViewAllSellers() ? this.domainApi.getVendedores() : of([]),
      estados: this.catalogoService.estadosCotizacion(),
    }).subscribe({
      next: ({ clientes, vendedores, estados }) => {
        this.clientes.set(clientes);
        this.vendedores.set(vendedores);
        this.estados.set(estados);
      },
      error: () => this.notifications.error('No se pudieron cargar los filtros de cotizaciones.'),
    });
  }

  loadCotizaciones(): void {
    this.isLoading.set(true);
    this.service
      .getCotizaciones(this.buildFilters())
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (items) => this.setCotizaciones(items),
        error: () => this.notifications.error('No se pudo cargar el listado de cotizaciones.'),
      });
  }

  clearFilters(): void {
    this.filtersForm.reset({
      search: '',
      idCliente: 'ALL',
      idVendedor: 'ALL',
      idEstadoCotizacion: 'ALL',
      moneda: 'ALL',
      fechaInicio: '',
      fechaFin: '',
    }, { emitEvent: false });
    this.loadCotizaciones();
  }

  generatePdf(item: CotizacionResponse): void {
    this.pdfLoadingId.set(item.idCotizacion);
    this.service
      .generarPdf(item.idCotizacion)
      .pipe(finalize(() => this.pdfLoadingId.set(null)))
      .subscribe({
        next: () => {
          this.notifications.success('PDF generado correctamente.');
          this.loadCotizaciones();
        },
        error: () => this.notifications.error('No se pudo generar el PDF.'),
      });
  }

  downloadPdf(item: CotizacionResponse): void {
    this.pdfLoadingId.set(item.idCotizacion);
    this.service
      .descargarPdf(item.idCotizacion)
      .pipe(finalize(() => this.pdfLoadingId.set(null)))
      .subscribe({
        next: (blob) => this.downloads.save(blob, this.pdfFileName(item)),
        error: () => this.notifications.error('No se pudo descargar el PDF de cotización.'),
      });
  }

  changeStatus(item: CotizacionResponse, estado: CatalogoItem): void {
    const isApproval = this.normalize(estado.descripcion).includes('aprobad');
    this.dialog
      .open(ConfirmDialogComponent, {
        width: '420px',
        data: {
          title: 'Cambiar estado',
          message: isApproval
            ? `Al aprobar la cotizacion ${this.quoteNumber(item)}, el stock reservado sera descontado del stock fisico.`
            : `Al cambiar la cotizacion ${this.quoteNumber(item)} a ${estado.descripcion}, el stock reservado sera liberado si estaba generada.`,
          confirmText: 'Cambiar estado',
        },
      })
      .afterClosed()
      .pipe(filter(Boolean))
      .subscribe(() => {
        this.statusLoadingId.set(item.idCotizacion);
        this.service
          .cambiarEstado(item.idCotizacion, { idEstadoCotizacion: estado.id })
          .pipe(finalize(() => this.statusLoadingId.set(null)))
          .subscribe({
            next: () => {
              this.notifications.success('Estado actualizado correctamente.');
              this.loadCotizaciones();
            },
            error: (error: HttpErrorResponse) =>
              this.notifications.error(error.error?.message ?? 'No se pudo cambiar el estado de la cotizacion.'),
          });
      });
  }

  formatMoney(value: number, moneda: string): string {
    const symbol = this.normalize(moneda).includes('dolar') ? 'US$' : 'S/';
    return `${symbol} ${Number(value ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatDate(value?: string): string {
    if (!value) {
      return '-';
    }
    return new Date(value).toLocaleDateString('es-PE');
  }

  clientLabel(item: ClienteV1): string {
    return `${item.ruc} - ${item.razonSocial}`;
  }

  userLabel(user: VendedorResponse): string {
    return user.nombreCompleto || [user.nombres, user.apellidoPaterno, user.apellidoMaterno].filter(Boolean).join(' ');
  }

  quoteNumber(item: CotizacionResponse): string {
    return item.numeroCotizacion || `C001-${String(item.idCotizacion).padStart(6, '0')}`;
  }

  hasPdf(item: CotizacionResponse): boolean {
    return Boolean(item.pdfPath);
  }

  isExpired(item: CotizacionResponse): boolean {
    if (item.vencida) {
      return true;
    }
    if (!item.fechaVencimiento) {
      return false;
    }
    return new Date(item.fechaVencimiento) <= new Date() && this.isGenerada(item);
  }

  availableStates(item: CotizacionResponse): CatalogoItem[] {
    if (!this.isGenerada(item)) {
      return [];
    }
    return this.estados().filter((estado) => {
      const label = this.normalize(estado.descripcion);
      if (estado.id === item.idEstadoCotizacion) {
        return false;
      }
      if (label.includes('aprobad')) {
        return item.puedeAprobarse === true;
      }
      return label.includes('rechaz') || label.includes('anulad');
    });
  }

  formatRemaining(item: CotizacionResponse): string {
    if (this.isExpired(item)) {
      return 'Vencida';
    }
    const seconds = item.tiempoRestanteSegundos
      ?? Math.max(0, Math.floor((new Date(item.fechaVencimiento).getTime() - Date.now()) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  emptyTitle(): string {
    return this.hasActiveFilters() ? 'Sin resultados' : 'No hay cotizaciones registradas';
  }

  emptyDescription(): string {
    return this.hasActiveFilters()
      ? 'No se encontraron cotizaciones con los filtros aplicados.'
      : 'Cuando registres una cotización, aparecerá en este listado.';
  }

  private buildFilters(): CotizacionFilter {
    const raw = this.filtersForm.getRawValue();
    return {
      search: raw.search || null,
      idCliente: this.numberFilter(raw.idCliente),
      idVendedor: this.permissions.canViewAllSellers() ? this.numberFilter(raw.idVendedor) : null,
      idEstadoCotizacion: this.numberFilter(raw.idEstadoCotizacion),
      fechaInicio: raw.fechaInicio || null,
      fechaFin: raw.fechaFin || null,
      moneda: raw.moneda === 'ALL' ? null : raw.moneda,
    };
  }

  private numberFilter(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '' || value === 'ALL') {
      return null;
    }
    return Number(value);
  }

  private pdfFileName(item: CotizacionResponse): string {
    return `COTIZACION-${this.quoteNumber(item)}.pdf`;
  }

  private normalize(value: string): string {
    return (value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private isGenerada(item: CotizacionResponse): boolean {
    return this.normalize(item.descEstadoCotizacion).includes('generad');
  }

  private configureTable(): void {
    this.dataSource.sortingDataAccessor = (item, property) => {
      const values: Record<string, string | number> = {
        numero: item.idCotizacion,
        cliente: item.razonSocialCliente,
        ruc: item.rucCliente,
        vendedor: item.nombreVendedor,
        fechaEmision: new Date(item.fechaEmision).getTime(),
        fechaVencimiento: new Date(item.fechaVencimiento).getTime(),
        tiempoRestante: item.tiempoRestanteSegundos ?? 0,
        moneda: item.moneda,
        importeTotal: item.importeTotal,
        estado: item.descEstadoCotizacion,
      };
      return values[property] ?? '';
    };
  }

  private setCotizaciones(items: CotizacionResponse[]): void {
    const moneda = this.filtersForm.controls.moneda.value;
    const filtered = moneda && moneda !== 'ALL'
      ? items.filter((item) => item.moneda === moneda)
      : items;
    this.cotizaciones.set(items);
    this.filteredCotizaciones.set(filtered);
    this.dataSource.data = filtered;
    this.paginator?.firstPage();
  }

  private hasActiveFilters(): boolean {
    const raw = this.filtersForm.getRawValue();
    return Boolean(
      raw.search ||
        raw.idCliente !== 'ALL' ||
        (this.permissions.canViewAllSellers() && raw.idVendedor !== 'ALL') ||
        raw.idEstadoCotizacion !== 'ALL' ||
        raw.moneda !== 'ALL' ||
        raw.fechaInicio ||
        raw.fechaFin,
    );
  }
}
