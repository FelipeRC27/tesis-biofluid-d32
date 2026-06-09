import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, finalize, firstValueFrom, forkJoin, map, of, switchMap } from 'rxjs';
import { VendedorResponse } from '../../../../core/auth/models/auth.models';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { PermissionService } from '../../../../core/auth/services/permission.service';
import { CatalogoItem, ClienteV1 } from '../../../../core/models/v1.models';
import { CatalogoV1Service } from '../../../../core/services/catalogo-v1.service';
import { ClienteV1Service } from '../../../../core/services/cliente-v1.service';
import { DomainApiService } from '../../../../core/services/domain-api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ProductService } from '../../../../core/services/product.service';
import { UbigeoIneiService } from '../../../../core/services/ubigeo-inei.service';
import { ProductResponse } from '../../../../core/models/product.models';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { MaterialModule } from '../../../../shared/material/material.module';
import {
  CotizacionCalcularItemResponse,
  CotizacionCalcularResumenResponse,
  CotizacionApiError,
  CotizacionCreateRequest,
} from '../../models/cotizacion.model';
import { CotizacionService } from '../../services/cotizacion.service';

@Component({
  selector: 'app-cotizacion-form',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MaterialModule, PageHeaderComponent],
  templateUrl: './cotizacion-form.component.html',
  styleUrl: './cotizacion-form.component.scss',
})
export class CotizacionFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly service = inject(CotizacionService);
  private readonly clienteService = inject(ClienteV1Service);
  private readonly productService = inject(ProductService);
  private readonly catalogoService = inject(CatalogoV1Service);
  private readonly domainApi = inject(DomainApiService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly ubigeoService = inject(UbigeoIneiService);
  readonly permissions = inject(PermissionService);
  private isSyncingUbigeo = false;

  readonly clientes = signal<ClienteV1[]>([]);
  private readonly allClientes = signal<ClienteV1[]>([]);
  readonly productos = signal<ProductResponse[]>([]);
  readonly vendedores = signal<VendedorResponse[]>([]);
  readonly estados = signal<CatalogoItem[]>([]);
  readonly departamentos = signal<string[]>([]);
  readonly provincias = signal<string[]>([]);
  readonly distritos = signal<string[]>([]);
  readonly items = signal<CotizacionCalcularItemResponse[]>([]);
  readonly resumen = signal<CotizacionCalcularResumenResponse | null>(null);
  readonly isLoading = signal(false);
  readonly isCalculating = signal(false);
  readonly isSaving = signal(false);
  readonly isSearchingClientes = signal(false);
  readonly isLoadingDepartamentos = signal(false);
  readonly isLoadingProvincias = signal(false);
  readonly isLoadingDistritos = signal(false);
  readonly isConsultandoUbigeo = signal(false);
  readonly isConsultandoCobertura = signal(false);
  readonly editingProductId = signal<number | null>(null);
  readonly selectedClientId = signal(0);
  readonly selectedProductId = signal(0);
  readonly tieneCobertura = signal<boolean | null>(null);
  readonly mensajeCobertura = signal<string | null>(null);
  readonly ubicacionErrorMessage = signal<string | null>(null);

  readonly itemColumns = ['item', 'producto', 'unidad', 'cantidad', 'precio', 'importe', 'acciones'];

  readonly clienteSearch = this.fb.nonNullable.control('');

  readonly selectedCliente = computed(() => {
    const id = this.selectedClientId() || this.form.controls.idCliente.value;
    return this.clientes().find((cliente) => cliente.idCliente === id) ?? null;
  });

  readonly form = this.fb.nonNullable.group({
    idCliente: [0, [Validators.required, Validators.min(1)]],
    idVendedor: [0, [Validators.required, Validators.min(1)]],
    moneda: ['SOLES', [Validators.required]],
    fechaVencimiento: [''],
    direccionDespacho: ['', [Validators.required]],
    departamento: ['', [Validators.required]],
    provincia: ['', [Validators.required]],
    distrito: ['', [Validators.required]],
    ubigeo: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    depProvDis: [''],
    flagCubierto: [false],
    observaciones: [''],
    idEstadoCotizacion: [0],
  });

  readonly productForm = this.fb.nonNullable.group({
    idProducto: [0, [Validators.required, Validators.min(1)]],
    cantidad: [1, [Validators.required, Validators.min(1)]],
  });

  ngOnInit(): void {
    this.form.controls.provincia.disable({ emitEvent: false });
    this.form.controls.distrito.disable({ emitEvent: false });
    this.form.controls.flagCubierto.disable({ emitEvent: false });
    if (this.permissions.isSeller()) {
      this.form.controls.idVendedor.disable({ emitEvent: false });
      const idUsuario = this.permissions.currentUserId();
      if (idUsuario) {
        this.form.controls.idVendedor.setValue(idUsuario, { emitEvent: false });
      }
    }
    this.bindUbigeoCascade();
    void this.loadDepartamentosAsync();
    this.loadCatalogs();
    this.clienteSearch.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((value) =>
          this.searchClientes(value).pipe(
            catchError(() => {
              this.notifications.error('No se pudo buscar clientes.');
              this.isSearchingClientes.set(false);
              return of([]);
            }),
          ),
        ),
      )
      .subscribe({
        next: (clientes) => this.clientes.set(clientes),
    });
    this.form.controls.idCliente.valueChanges.subscribe((idCliente) => {
      this.selectedClientId.set(this.toNumber(idCliente));
      this.applyClienteDefaults(this.toNumber(idCliente));
    });
    this.form.controls.moneda.valueChanges.subscribe(() => this.clearItems());
    this.productForm.controls.idProducto.valueChanges.subscribe((idProducto) =>
      this.selectedProductId.set(this.toNumber(idProducto)),
    );
  }

  addItem(): void {
    this.ensureSelectedClienteFromSearch();
    if (this.form.controls.idCliente.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Selecciona un cliente antes de agregar productos.');
      return;
    }
    if (this.productForm.invalid) {
      this.form.markAllAsTouched();
      this.productForm.markAllAsTouched();
      return;
    }
    const raw = this.productForm.getRawValue();
    const idProducto = this.toNumber(raw.idProducto);
    const cantidad = this.toNumber(raw.cantidad);
    const validationMessage = this.validateProductSelection(idProducto, cantidad);
    if (validationMessage) {
      this.notifications.error(validationMessage);
      return;
    }
    this.isCalculating.set(true);
    this.service
      .calcularItem({
        idCliente: this.form.controls.idCliente.value,
        idProducto,
        cantidad,
        moneda: this.form.controls.moneda.value,
      })
      .pipe(finalize(() => this.isCalculating.set(false)))
      .subscribe({
        next: (item) => {
          this.items.update((current) => {
            const nextItems = current.filter((existing) => existing.idProducto !== item.idProducto);
            return [...nextItems, item];
          });
          this.clearProductForm();
          this.refreshResumen();
        },
        error: (error: HttpErrorResponse) => {
          this.applyFieldErrors(error);
          this.notifications.error(error.error?.message ?? 'No se pudo calcular el producto seleccionado.');
        },
      });
  }

  editItem(item: CotizacionCalcularItemResponse): void {
    this.editingProductId.set(item.idProducto);
    this.productForm.setValue({ idProducto: item.idProducto, cantidad: item.cantidad });
  }

  cancelEdit(): void {
    this.clearProductForm();
  }

  removeItem(idProducto: number): void {
    this.items.update((current) => current.filter((item) => item.idProducto !== idProducto));
    if (this.editingProductId() === idProducto) {
      this.clearProductForm();
    }
    this.refreshResumen();
  }

  save(generatePdf: boolean): void {
    void this.saveAsync(generatePdf);
  }

  private async saveAsync(generatePdf: boolean): Promise<void> {
    if (!this.items().length) {
      this.form.markAllAsTouched();
      this.notifications.error('Completa los datos obligatorios y agrega al menos un producto.');
      return;
    }
    const despachoValido = await this.ensureDespachoBeforeSave();
    if (this.form.invalid || !despachoValido) {
      this.form.markAllAsTouched();
      if (despachoValido) {
        this.notifications.error('Completa los datos obligatorios y agrega al menos un producto.');
      }
      return;
    }
    this.isSaving.set(true);
    const request = this.buildRequest();
    const create$ = this.service.createCotizacion(request);
    const flow$ = generatePdf
      ? create$.pipe(switchMap((cotizacion) => this.service.generarPdf(cotizacion.idCotizacion).pipe(map(() => cotizacion))))
      : create$;

    flow$.pipe(finalize(() => this.isSaving.set(false))).subscribe({
      next: (cotizacion) => {
        this.notifications.success(
          generatePdf
            ? 'Cotizacion generada correctamente. El stock fue reservado por 24 horas y el PDF fue generado.'
            : 'Cotizacion generada correctamente. El stock fue reservado por 24 horas.',
        );
        this.router.navigate(['/cotizaciones', cotizacion.idCotizacion]);
      },
      error: (error: HttpErrorResponse) => {
        this.applyFieldErrors(error);
        this.notifications.error(error.error?.message ?? 'No se pudo registrar la cotización.');
      },
    });
  }

  formatMoney(value: number, moneda = this.form.controls.moneda.value): string {
    const symbol = this.normalize(moneda).includes('dolar') ? 'US$' : 'S/';
    return `${symbol} ${Number(value ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  productName(idProducto: number): string {
    return this.productos().find((producto) => producto.id === idProducto)?.nombre ?? `Producto #${idProducto}`;
  }

  productMinimumLabel(): string {
    const product = this.currentProduct();
    if (!product) {
      return 'Selecciona un producto para ver condiciones de venta.';
    }
    return `Mínimo ${product.cantMinVenta}. Stock disponible ${product.stockDisponible}.`;
  }

  canSave(): boolean {
    return this.form.valid && this.items().length > 0 && !this.isSaving() && !this.isConsultandoUbigeo() && !this.isConsultandoCobertura();
  }

  userLabel(user: VendedorResponse): string {
    return user.nombreCompleto || [user.nombres, user.apellidoPaterno, user.apellidoMaterno].filter(Boolean).join(' ');
  }

  clientLabel(cliente: ClienteV1): string {
    return `${cliente.ruc} - ${cliente.razonSocial}`;
  }

  selectCliente(cliente: ClienteV1, isUserInput = true): void {
    if (!isUserInput) {
      return;
    }
    this.clienteSearch.setValue(this.clientLabel(cliente), { emitEvent: false });
    this.selectedClientId.set(cliente.idCliente);
    this.form.patchValue({ idCliente: cliente.idCliente });
  }

  private loadCatalogs(): void {
    this.isLoading.set(true);
    forkJoin({
      clientes: this.clienteService.findAll(),
      productos: this.productService.getProducts(),
      vendedores: this.permissions.canViewAllSellers() ? this.domainApi.getVendedores() : of(this.currentUserAsVendedor()),
      estados: this.catalogoService.estadosCotizacion(),
    })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ clientes, productos, vendedores, estados }) => {
          this.allClientes.set(clientes);
          this.clientes.set(clientes);
          this.productos.set(productos);
          const idUsuario = this.permissions.currentUserId();
          this.vendedores.set(this.permissions.isSeller() && idUsuario
            ? vendedores.filter((vendedor) => vendedor.idUsuario === idUsuario)
            : vendedores);
          this.estados.set(estados);
          const firstEstado = estados[0]?.id ?? 0;
          this.form.patchValue({ idEstadoCotizacion: firstEstado });
        },
        error: () => this.notifications.error('No se pudieron cargar los datos para crear la cotización.'),
      });
  }

  private applyClienteDefaults(idCliente: number, clearProducts = true): void {
    const cliente = this.clientes().find((item) => item.idCliente === idCliente);
    if (!cliente) {
      return;
    }
    this.form.patchValue({
      idVendedor: this.permissions.isSeller()
        ? this.permissions.currentUserId() ?? this.form.controls.idVendedor.value
        : cliente.idVendedorAsignado ?? this.form.controls.idVendedor.value,
      direccionDespacho: cliente.direccion ?? '',
    });
    void this.syncUbigeoSelection(cliente);
    if (clearProducts) {
      this.clearItems();
    }
  }

  private refreshResumen(): void {
    if (!this.items().length) {
      this.resumen.set(null);
      return;
    }
    this.service
      .calcularResumen({
        idCliente: this.form.controls.idCliente.value,
        moneda: this.form.controls.moneda.value,
        detalles: this.items().map((item) => ({ idProducto: item.idProducto, cantidad: item.cantidad })),
      })
      .subscribe({
        next: (resumen) => this.resumen.set(resumen),
        error: (error: HttpErrorResponse) =>
          this.notifications.error(error.error?.message ?? 'No se pudo recalcular el resumen de la cotización.'),
      });
  }

  private clearItems(): void {
    this.items.set([]);
    this.resumen.set(null);
    this.clearProductForm();
  }

  private clearProductForm(): void {
    this.editingProductId.set(null);
    this.selectedProductId.set(0);
    this.productForm.reset({ idProducto: 0, cantidad: 1 });
  }

  private searchClientes(value: string) {
    const query = value.trim();
    const selectedByText = this.findClienteByLabel(query);
    if (selectedByText) {
      this.selectedClientId.set(selectedByText.idCliente);
      this.form.patchValue({ idCliente: selectedByText.idCliente }, { emitEvent: false });
      this.isSearchingClientes.set(false);
      return of(this.allClientes());
    }
    if (this.currentClienteMatches(query)) {
      this.isSearchingClientes.set(false);
      return of(this.allClientes());
    }
    this.selectedClientId.set(0);
    this.form.patchValue({ idCliente: 0 }, { emitEvent: false });
    this.clearItems();
    if (!query) {
      this.isSearchingClientes.set(false);
      return of(this.allClientes());
    }
    this.isSearchingClientes.set(true);
    const ruc = /^\d+$/.test(query) ? query : undefined;
    const razonSocial = ruc ? undefined : query;
    return this.clienteService.buscar(ruc, razonSocial).pipe(finalize(() => this.isSearchingClientes.set(false)));
  }

  private buildRequest(): CotizacionCreateRequest {
    const raw = this.form.getRawValue();
    const depProvDis = this.buildDepProvDis(raw.departamento, raw.provincia, raw.distrito);
    return {
      idCliente: raw.idCliente,
      idVendedor: this.permissions.isSeller() ? this.permissions.currentUserId() ?? raw.idVendedor : raw.idVendedor,
      moneda: raw.moneda,
      direccionDespacho: raw.direccionDespacho || undefined,
      depProvDis: depProvDis || undefined,
      flagCubierto: raw.flagCubierto ? 1 : 0,
      observaciones: raw.observaciones || undefined,
      detalles: this.items().map((item) => ({
        idProducto: item.idProducto,
        cantidad: item.cantidad,
        precioUni: item.precioUnitario,
      })),
    };
  }

  private normalize(value: string): string {
    return (value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private bindUbigeoCascade(): void {
    this.form.controls.departamento.valueChanges.pipe(distinctUntilChanged()).subscribe((departamento) => {
      if (this.isSyncingUbigeo) {
        return;
      }
      void this.onDepartamentoChange(departamento);
    });

    this.form.controls.provincia.valueChanges.pipe(distinctUntilChanged()).subscribe((provincia) => {
      if (this.isSyncingUbigeo) {
        return;
      }
      void this.onProvinciaChange(provincia);
    });

    this.form.controls.distrito.valueChanges.pipe(distinctUntilChanged()).subscribe((distrito) => {
      if (this.isSyncingUbigeo) {
        return;
      }
      void this.onDistritoChange(distrito);
    });
  }

  private async onDepartamentoChange(rawDepartamento: string): Promise<void> {
    const departamento = this.normalizeLocationText(rawDepartamento);
    this.provincias.set([]);
    this.distritos.set([]);
    this.form.patchValue(
      {
        departamento,
        provincia: '',
        distrito: '',
        ubigeo: '',
        depProvDis: '',
        flagCubierto: false,
      },
      { emitEvent: false },
    );
    this.form.controls.provincia.disable({ emitEvent: false });
    this.form.controls.distrito.disable({ emitEvent: false });
    this.clearCoberturaMessage();

    if (!departamento) {
      return;
    }

    await this.loadProvinciasAsync(departamento);
    this.form.controls.provincia.enable({ emitEvent: false });
  }

  private async onProvinciaChange(rawProvincia: string): Promise<void> {
    const departamento = this.form.controls.departamento.value;
    const provincia = this.normalizeLocationText(rawProvincia);
    this.distritos.set([]);
    this.form.patchValue(
      {
        provincia,
        distrito: '',
        ubigeo: '',
        depProvDis: '',
        flagCubierto: false,
      },
      { emitEvent: false },
    );
    this.form.controls.distrito.disable({ emitEvent: false });
    this.clearCoberturaMessage();

    if (!departamento || !provincia) {
      return;
    }

    await this.loadDistritosAsync(departamento, provincia);
    this.form.controls.distrito.enable({ emitEvent: false });
  }

  private async onDistritoChange(rawDistrito: string): Promise<void> {
    const departamento = this.form.controls.departamento.value;
    const provincia = this.form.controls.provincia.value;
    const distrito = this.normalizeLocationText(rawDistrito);
    this.form.patchValue(
      {
        distrito,
        ubigeo: '',
        depProvDis: this.buildDepProvDis(departamento, provincia, distrito),
        flagCubierto: false,
      },
      { emitEvent: false },
    );
    this.clearCoberturaMessage();

    if (!departamento || !provincia || !distrito) {
      return;
    }

    await this.consultarUbigeoYCobertura(departamento, provincia, distrito);
  }

  private async syncUbigeoSelection(cliente: ClienteV1): Promise<void> {
    this.isSyncingUbigeo = true;
    this.clearCoberturaMessage();
    try {
      if (!this.departamentos().length) {
        await this.loadDepartamentosAsync();
      }

      const departamento = this.pickCatalogValue(this.departamentos(), cliente.departamento, (items) => this.departamentos.set(items));
      this.form.patchValue(
        {
          departamento,
          provincia: '',
          distrito: '',
          ubigeo: this.normalizeUbigeoValue(cliente.ubigeo),
          depProvDis: '',
          flagCubierto: false,
        },
        { emitEvent: false },
      );

      if (!departamento) {
        this.form.controls.provincia.disable({ emitEvent: false });
        this.form.controls.distrito.disable({ emitEvent: false });
        return;
      }

      await this.loadProvinciasAsync(departamento);
      this.form.controls.provincia.enable({ emitEvent: false });

      const provincia = this.pickCatalogValue(this.provincias(), cliente.provincia, (items) => this.provincias.set(items));
      this.form.patchValue({ provincia, distrito: '' }, { emitEvent: false });

      if (!provincia) {
        this.form.controls.distrito.disable({ emitEvent: false });
        return;
      }

      await this.loadDistritosAsync(departamento, provincia);
      this.form.controls.distrito.enable({ emitEvent: false });

      const distrito = this.pickCatalogValue(this.distritos(), cliente.distrito, (items) => this.distritos.set(items));
      this.form.patchValue(
        {
          distrito,
          depProvDis: this.buildDepProvDis(departamento, provincia, distrito),
        },
        { emitEvent: false },
      );

      if (departamento && provincia && distrito) {
        await this.consultarUbigeoYCobertura(departamento, provincia, distrito, cliente.ubigeo ?? '');
      }
    } finally {
      this.isSyncingUbigeo = false;
    }
  }

  private async loadDepartamentosAsync(): Promise<string[]> {
    this.isLoadingDepartamentos.set(true);
    this.ubicacionErrorMessage.set(null);
    try {
      const departamentos = await firstValueFrom(this.ubigeoService.listarDepartamentos());
      const normalized = this.normalizeCatalogValues(departamentos);
      this.departamentos.set(normalized);
      return normalized;
    } catch {
      this.departamentos.set([]);
      this.ubicacionErrorMessage.set('No se pudieron cargar los departamentos.');
      return [];
    } finally {
      this.isLoadingDepartamentos.set(false);
    }
  }

  private async loadProvinciasAsync(departamento: string): Promise<string[]> {
    this.isLoadingProvincias.set(true);
    this.ubicacionErrorMessage.set(null);
    try {
      const provincias = await firstValueFrom(this.ubigeoService.listarProvincias(departamento));
      const normalized = this.normalizeCatalogValues(provincias);
      this.provincias.set(normalized);
      return normalized;
    } catch {
      this.provincias.set([]);
      this.ubicacionErrorMessage.set('No se pudieron cargar las provincias del departamento seleccionado.');
      return [];
    } finally {
      this.isLoadingProvincias.set(false);
    }
  }

  private async loadDistritosAsync(departamento: string, provincia: string): Promise<string[]> {
    this.isLoadingDistritos.set(true);
    this.ubicacionErrorMessage.set(null);
    try {
      const distritos = await firstValueFrom(this.ubigeoService.listarDistritos(departamento, provincia));
      const normalized = this.normalizeCatalogValues(distritos);
      this.distritos.set(normalized);
      return normalized;
    } catch {
      this.distritos.set([]);
      this.ubicacionErrorMessage.set('No se pudieron cargar los distritos de la provincia seleccionada.');
      return [];
    } finally {
      this.isLoadingDistritos.set(false);
    }
  }

  private async consultarUbigeoYCobertura(
    departamento: string,
    provincia: string,
    distrito: string,
    fallbackUbigeo = '',
  ): Promise<boolean> {
    this.isConsultandoUbigeo.set(true);
    this.ubicacionErrorMessage.set(null);
    try {
      const response = await firstValueFrom(this.ubigeoService.consultarCodigoUbigeo(departamento, provincia, distrito));
      const selectedDepartamento = this.ensureCatalogOption(
        this.departamentos(),
        response.departamento,
        (items) => this.departamentos.set(items),
      );
      const selectedProvincia = this.ensureCatalogOption(this.provincias(), response.provincia, (items) => this.provincias.set(items));
      const selectedDistrito = this.ensureCatalogOption(this.distritos(), response.distrito, (items) => this.distritos.set(items));
      this.form.patchValue(
        {
          departamento: selectedDepartamento,
          provincia: selectedProvincia,
          distrito: selectedDistrito,
          ubigeo: response.ubigeo,
          depProvDis: this.buildDepProvDis(selectedDepartamento, selectedProvincia, selectedDistrito),
        },
        { emitEvent: false },
      );
      return await this.consultarCobertura(response.ubigeo);
    } catch {
      const normalizedFallback = this.normalizeUbigeoValue(fallbackUbigeo);
      if (normalizedFallback) {
        this.form.controls.ubigeo.setValue(normalizedFallback, { emitEvent: false });
        return await this.consultarCobertura(normalizedFallback);
      }
      this.limpiarUbigeoYCobertura();
      this.ubicacionErrorMessage.set('No se encontro ubigeo para la ubicacion seleccionada.');
      return false;
    } finally {
      this.isConsultandoUbigeo.set(false);
    }
  }

  private async consultarCobertura(ubigeo: string): Promise<boolean> {
    const normalizedUbigeo = this.normalizeUbigeoValue(ubigeo);
    if (!normalizedUbigeo) {
      this.limpiarCobertura();
      return false;
    }

    this.isConsultandoCobertura.set(true);
    try {
      const response = await firstValueFrom(this.ubigeoService.consultarCoberturaPorUbigeo(normalizedUbigeo));
      const cubierto = response.tieneCobertura === true || response.flagCobertura === 1;
      this.tieneCobertura.set(cubierto);
      this.mensajeCobertura.set(
        cubierto
          ? 'La zona seleccionada cuenta con cobertura de despacho.'
          : 'La zona seleccionada no cuenta con cobertura de despacho.',
      );
      this.form.patchValue({ flagCubierto: cubierto }, { emitEvent: false });
      return true;
    } catch {
      this.limpiarCobertura();
      this.ubicacionErrorMessage.set('No se pudo consultar la cobertura de despacho.');
      return false;
    } finally {
      this.isConsultandoCobertura.set(false);
    }
  }

  private async ensureDespachoBeforeSave(): Promise<boolean> {
    const raw = this.form.getRawValue();
    if (!raw.direccionDespacho || !raw.departamento || !raw.provincia || !raw.distrito) {
      this.notifications.error('Completa la direccion y ubicacion de despacho.');
      return false;
    }

    if (!/^\d{6}$/.test(raw.ubigeo)) {
      const found = await this.consultarUbigeoYCobertura(raw.departamento, raw.provincia, raw.distrito);
      if (!found) {
        this.notifications.error('No se puede generar la cotizacion porque no se pudo determinar el ubigeo de despacho.');
        return false;
      }
    }

    if (this.tieneCobertura() === null) {
      const checked = await this.consultarCobertura(this.form.controls.ubigeo.value);
      if (!checked) {
        this.notifications.error('No se pudo validar la cobertura de despacho. Intente nuevamente.');
        return false;
      }
    }

    this.form.controls.depProvDis.setValue(
      this.buildDepProvDis(
        this.form.controls.departamento.value,
        this.form.controls.provincia.value,
        this.form.controls.distrito.value,
      ),
      { emitEvent: false },
    );
    return true;
  }

  private limpiarUbigeoYCobertura(): void {
    this.form.patchValue({ ubigeo: '', flagCubierto: false }, { emitEvent: false });
    this.limpiarCobertura();
  }

  private limpiarCobertura(): void {
    this.tieneCobertura.set(null);
    this.mensajeCobertura.set(null);
    this.form.patchValue({ flagCubierto: false }, { emitEvent: false });
  }

  private clearCoberturaMessage(): void {
    this.tieneCobertura.set(null);
    this.mensajeCobertura.set(null);
    this.ubicacionErrorMessage.set(null);
  }

  private buildDepProvDis(departamento: string, provincia: string, distrito: string): string {
    return [departamento, provincia, distrito].map((value) => this.normalizeLocationText(value)).filter(Boolean).join(' / ');
  }

  private normalizeCatalogValues(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => this.normalizeLocationText(value)).filter(Boolean)));
  }

  private normalizeLocationText(value: string | null | undefined): string {
    return (value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  }

  private normalizeUbigeoValue(value: string | null | undefined): string {
    const normalized = (value ?? '').trim();
    return /^\d{6}$/.test(normalized) ? normalized : '';
  }

  private pickCatalogValue(
    options: string[],
    rawValue: string | null | undefined,
    updateOptions: (items: string[]) => void,
  ): string {
    return this.ensureCatalogOption(options, rawValue, updateOptions);
  }

  private ensureCatalogOption(
    options: string[],
    rawValue: string | null | undefined,
    updateOptions: (items: string[]) => void,
  ): string {
    const normalized = this.normalizeLocationText(rawValue);
    if (!normalized) {
      return '';
    }

    const match = options.find((option) => this.normalizeLocationText(option) === normalized);
    if (match) {
      return match;
    }

    updateOptions([...options, normalized]);
    return normalized;
  }

  private validateProductSelection(idProducto: number, cantidad: number): string | null {
    const product = this.productos().find((item) => item.id === idProducto);
    if (!product) {
      return 'Selecciona un producto válido.';
    }
    if (cantidad <= 0) {
      return 'La cantidad debe ser mayor a cero.';
    }
    if (cantidad < product.cantMinVenta) {
      return `La cantidad mínima de venta para ${product.nombre} es ${product.cantMinVenta}.`;
    }
    if (cantidad > product.stockDisponible) {
      return `Stock insuficiente. Disponible: ${product.stockDisponible}.`;
    }
    const isEditingSameProduct = this.editingProductId() === idProducto;
    const duplicated = this.items().some((item) => item.idProducto === idProducto);
    if (duplicated && !isEditingSameProduct) {
      return 'Este producto ya fue agregado. Edita la cantidad desde la tabla.';
    }
    return null;
  }

  private currentProduct(): ProductResponse | null {
    const idProducto = this.selectedProductId() || this.toNumber(this.productForm.controls.idProducto.value);
    return this.productos().find((producto) => producto.id === idProducto) ?? null;
  }

  private ensureSelectedClienteFromSearch(): void {
    if (this.form.controls.idCliente.valid) {
      return;
    }
    const cliente = this.findClienteByLabel(this.clienteSearch.value.trim());
    if (!cliente) {
      return;
    }
    this.selectedClientId.set(cliente.idCliente);
    this.form.patchValue({ idCliente: cliente.idCliente }, { emitEvent: false });
    this.applyClienteDefaults(cliente.idCliente, false);
  }

  private findClienteByLabel(value: string): ClienteV1 | null {
    if (!value) {
      return null;
    }
    const normalizedValue = this.normalize(value);
    return (
      this.allClientes().find((cliente) => this.normalize(this.clientLabel(cliente)) === normalizedValue) ??
      this.clientes().find((cliente) => this.normalize(this.clientLabel(cliente)) === normalizedValue) ??
      null
    );
  }

  private currentClienteMatches(value: string): boolean {
    const idCliente = this.selectedClientId() || this.toNumber(this.form.controls.idCliente.value);
    const cliente = this.allClientes().find((item) => item.idCliente === idCliente);
    return Boolean(cliente && this.normalize(this.clientLabel(cliente)) === this.normalize(value));
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private currentUserAsVendedor(): VendedorResponse[] {
    const user = this.auth.currentUser();
    return user ? [{
      idUsuario: user.idUsuario,
      nombres: user.nombres,
      apellidoPaterno: user.apellidoPaterno,
      apellidoMaterno: user.apellidoMaterno,
      nombreCompleto: [user.nombres, user.apellidoPaterno, user.apellidoMaterno].filter(Boolean).join(' '),
      correo: user.correo,
    }] : [];
  }

  private applyFieldErrors(error: HttpErrorResponse): void {
    const apiError = error.error as CotizacionApiError | undefined;
    const fieldErrors = apiError?.fieldErrors;
    if (!fieldErrors) {
      return;
    }
    Object.entries(fieldErrors).forEach(([field, message]) => {
      const formControl = this.form.get(field);
      const productControl = this.productForm.get(field);
      const control = formControl ?? productControl;
      control?.setErrors({ backend: message });
      control?.markAsTouched();
    });
  }
}
