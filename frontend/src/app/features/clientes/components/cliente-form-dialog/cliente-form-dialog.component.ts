import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  finalize,
  firstValueFrom,
  forkJoin,
  of,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { VendedorResponse } from '../../../../core/auth/models/auth.models';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { PermissionService } from '../../../../core/auth/services/permission.service';
import { ClienteCreateRequest, ClienteResponseVm, ClienteUpdateRequest } from '../../../../core/models/cliente.models';
import { RucConsultaResponse } from '../../../../core/models/documento.models';
import { CatalogoItem } from '../../../../core/models/v1.models';
import { CatalogoV1Service } from '../../../../core/services/catalogo-v1.service';
import { DocumentoService } from '../../../../core/services/documento.service';
import { DomainApiService } from '../../../../core/services/domain-api.service';
import { UbigeoIneiService } from '../../../../core/services/ubigeo-inei.service';
import { MaterialModule } from '../../../../shared/material/material.module';

interface ClienteFormDialogData {
  mode: 'create' | 'edit';
  cliente?: ClienteResponseVm;
}

@Component({
  selector: 'app-cliente-form-dialog',
  imports: [ReactiveFormsModule, MaterialModule],
  templateUrl: './cliente-form-dialog.component.html',
  styleUrl: './cliente-form-dialog.component.scss',
})
export class ClienteFormDialogComponent implements OnDestroy {
  readonly data = inject<ClienteFormDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<ClienteFormDialogComponent>);
  private readonly documentoService = inject(DocumentoService);
  private readonly catalogos = inject(CatalogoV1Service);
  private readonly domainApi = inject(DomainApiService);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly ubigeos = inject(UbigeoIneiService);
  private readonly destroy$ = new Subject<void>();
  private lastQueriedRuc = '';
  private isSyncingUbigeo = false;

  readonly tiposCliente = signal<CatalogoItem[]>([]);
  readonly estadosClienteContacto = signal<CatalogoItem[]>([]);
  readonly vendedores = signal<VendedorResponse[]>([]);
  readonly departamentos = signal<string[]>([]);
  readonly provincias = signal<string[]>([]);
  readonly distritos = signal<string[]>([]);
  readonly isLoadingCatalogos = signal(false);
  readonly isLoadingDepartamentos = signal(false);
  readonly isLoadingProvincias = signal(false);
  readonly isLoadingDistritos = signal(false);
  readonly isConsultandoUbigeo = signal(false);
  readonly catalogoError = signal<string | null>(null);
  readonly vendedoresError = signal<string | null>(null);
  readonly estadoActivoError = signal<string | null>(null);

  isConsultandoRuc = false;
  rucInfoMessage: string | null = null;
  rucErrorMessage: string | null = null;
  rucAptoMensaje: string | null = null;
  ubicacionInfoMessage: string | null = null;
  ubicacionErrorMessage: string | null = null;

  readonly form = this.fb.nonNullable.group({
    ruc: ['', [Validators.required, Validators.pattern(/^\d{11}$/)]],
    razonSocial: ['', [Validators.required, Validators.maxLength(200)]],
    idTipoCliente: [0, [Validators.required, Validators.min(1)]],
    idVendedorAsignado: [0, [Validators.required, Validators.min(1)]],
    direccionFiscal: [''],
    departamento: ['', [Validators.required]],
    provincia: ['', [Validators.required]],
    distrito: ['', [Validators.required]],
    condicionSunat: ['', [Validators.required]],
    estadoSunat: ['', [Validators.required]],
    ubigeo: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    idEstadoClienteContacto: [0, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    this.form.controls.provincia.disable({ emitEvent: false });
    this.form.controls.distrito.disable({ emitEvent: false });
    this.bindUbigeoCascade();
    this.loadCatalogos();

    if (this.permissions.isSeller()) {
      const idUsuario = this.permissions.currentUserId();
      if (idUsuario) {
        this.form.controls.idVendedorAsignado.setValue(idUsuario, { emitEvent: false });
        this.form.controls.idVendedorAsignado.disable({ emitEvent: false });
      }
    }

    if (this.data.cliente) {
      this.patchClienteValues(this.data.cliente);
      void this.syncUbigeoSelection({
        departamento: this.data.cliente.departamento,
        provincia: this.data.cliente.provincia,
        distrito: this.data.cliente.distrito,
        ubigeo: this.data.cliente.ubigeo,
      });
    } else {
      void this.loadDepartamentosAsync();
    }

    this.bindRucAutoLookup();
  }

  get isCreateMode(): boolean {
    return this.data.mode === 'create';
  }

  get estadoClienteNombre(): string {
    const selectedId = this.form.controls.idEstadoClienteContacto.value;
    if (!selectedId) {
      return 'Sin estado';
    }
    return this.estadosClienteContacto().find((item) => item.id === selectedId)?.descripcion ?? 'Sin estado';
  }

  get canSubmit(): boolean {
    if (this.isLoadingCatalogos()) {
      return false;
    }
    return !this.catalogoError() && !this.vendedoresError() && !this.estadoActivoError();
  }

  private bindUbigeoCascade(): void {
    this.form.controls.departamento.valueChanges
      .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((departamento) => {
        if (this.isSyncingUbigeo) {
          return;
        }
        void this.onDepartamentoChange(departamento);
      });

    this.form.controls.provincia.valueChanges
      .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((provincia) => {
        if (this.isSyncingUbigeo) {
          return;
        }
        void this.onProvinciaChange(provincia);
      });

    this.form.controls.distrito.valueChanges
      .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((distrito) => {
        if (this.isSyncingUbigeo) {
          return;
        }
        void this.onDistritoChange(distrito);
      });
  }

  private async onDepartamentoChange(rawDepartamento: string): Promise<void> {
    const departamento = this.normalizeLocationText(rawDepartamento);
    this.clearUbigeoMessages();
    this.provincias.set([]);
    this.distritos.set([]);
    this.form.patchValue({ departamento, provincia: '', distrito: '', ubigeo: '' }, { emitEvent: false });
    this.form.controls.provincia.disable({ emitEvent: false });
    this.form.controls.distrito.disable({ emitEvent: false });

    if (!departamento) {
      return;
    }

    await this.loadProvinciasAsync(departamento);
    this.form.controls.provincia.enable({ emitEvent: false });
  }

  private async onProvinciaChange(rawProvincia: string): Promise<void> {
    const departamento = this.form.controls.departamento.value;
    const provincia = this.normalizeLocationText(rawProvincia);
    this.clearUbigeoMessages();
    this.distritos.set([]);
    this.form.patchValue({ provincia, distrito: '', ubigeo: '' }, { emitEvent: false });
    this.form.controls.distrito.disable({ emitEvent: false });

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
    this.form.patchValue({ distrito, ubigeo: '' }, { emitEvent: false });

    if (!departamento || !provincia || !distrito) {
      return;
    }

    await this.consultarUbigeoAsync(departamento, provincia, distrito);
  }

  private bindRucAutoLookup(): void {
    this.form.controls.ruc.valueChanges
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),
        tap((rawValue) => {
          const currentValue = (rawValue ?? '').trim();
          this.resetRucMessages();
          if (currentValue.length < 11) {
            this.lastQueriedRuc = '';
          }
        }),
        filter((rawValue) => /^\d{11}$/.test((rawValue ?? '').trim())),
        filter((rawValue) => {
          const sanitized = (rawValue ?? '').trim();
          return sanitized !== this.lastQueriedRuc;
        }),
        tap(() => {
          this.isConsultandoRuc = true;
          this.rucInfoMessage = 'Consultando datos del RUC...';
        }),
        switchMap((rawValue) => {
          const ruc = (rawValue ?? '').trim();
          this.lastQueriedRuc = ruc;
          return this.documentoService.consultarRuc(ruc).pipe(
            catchError((error: HttpErrorResponse) => {
              this.handleRucLookupError(error);
              return of(null);
            }),
            finalize(() => (this.isConsultandoRuc = false)),
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((response) => {
        if (!response) {
          return;
        }
        void this.applyRucResponse(response);
      });
  }

  private async applyRucResponse(response: RucConsultaResponse): Promise<void> {
    this.form.patchValue({
      ruc: response.ruc ?? this.form.controls.ruc.value,
      razonSocial: response.razonSocial ?? '',
      condicionSunat: response.condicion ?? '',
      estadoSunat: response.estado ?? '',
      direccionFiscal: response.direccion ?? '',
    });

    await this.syncUbigeoSelection({
      departamento: response.departamento,
      provincia: response.provincia,
      distrito: response.distrito,
      ubigeo: response.ubigeo,
    });

    this.rucInfoMessage = 'Datos del cliente encontrados y completados automaticamente.';
    this.rucErrorMessage = null;

    if (response.aptoParaCotizacion === true) {
      this.rucAptoMensaje = response.mensajeValidacion ?? 'RUC valido para cotizacion automatica.';
      return;
    }

    if (response.aptoParaCotizacion === false) {
      this.rucAptoMensaje =
        response.mensajeValidacion ??
        'Este RUC no cumple las condiciones recomendadas para cotizacion automatica. Revise la informacion antes de continuar.';
      return;
    }

    this.rucAptoMensaje = null;
  }

  private async syncUbigeoSelection(values: {
    departamento?: string | null;
    provincia?: string | null;
    distrito?: string | null;
    ubigeo?: string | null;
  }): Promise<void> {
    this.isSyncingUbigeo = true;
    this.clearUbigeoMessages();
    this.ubicacionInfoMessage = 'Sincronizando departamento, provincia y distrito...';

    try {
      if (!this.departamentos().length) {
        await this.loadDepartamentosAsync();
      }

      const departamento = this.pickCatalogValue(
        this.departamentos(),
        values.departamento,
        (items) => this.departamentos.set(items),
      );

      this.form.patchValue(
        {
          departamento,
          provincia: '',
          distrito: '',
          ubigeo: this.normalizeUbigeoValue(values.ubigeo),
        },
        { emitEvent: false },
      );

      if (!departamento) {
        this.form.controls.provincia.disable({ emitEvent: false });
        this.form.controls.distrito.disable({ emitEvent: false });
        this.ubicacionInfoMessage = null;
        return;
      }

      await this.loadProvinciasAsync(departamento);
      this.form.controls.provincia.enable({ emitEvent: false });

      const provincia = this.pickCatalogValue(this.provincias(), values.provincia, (items) => this.provincias.set(items));
      this.form.patchValue({ provincia, distrito: '' }, { emitEvent: false });

      if (!provincia) {
        this.form.controls.distrito.disable({ emitEvent: false });
        this.ubicacionInfoMessage = null;
        return;
      }

      await this.loadDistritosAsync(departamento, provincia);
      this.form.controls.distrito.enable({ emitEvent: false });

      const distrito = this.pickCatalogValue(this.distritos(), values.distrito, (items) => this.distritos.set(items));
      this.form.patchValue({ distrito }, { emitEvent: false });

      if (departamento && provincia && distrito) {
        await this.consultarUbigeoAsync(departamento, provincia, distrito, values.ubigeo ?? '');
        return;
      }

      this.ubicacionInfoMessage = null;
    } finally {
      this.isSyncingUbigeo = false;
    }
  }

  private async loadDepartamentosAsync(): Promise<string[]> {
    this.isLoadingDepartamentos.set(true);
    try {
      const departamentos = await firstValueFrom(this.ubigeos.listarDepartamentos());
      const normalized = this.normalizeCatalogValues(departamentos);
      this.departamentos.set(normalized);
      return normalized;
    } catch {
      this.ubicacionErrorMessage = 'No se pudieron cargar los departamentos.';
      this.departamentos.set([]);
      return [];
    } finally {
      this.isLoadingDepartamentos.set(false);
    }
  }

  private async loadProvinciasAsync(departamento: string): Promise<string[]> {
    this.isLoadingProvincias.set(true);
    try {
      const provincias = await firstValueFrom(this.ubigeos.listarProvincias(departamento));
      const normalized = this.normalizeCatalogValues(provincias);
      this.provincias.set(normalized);
      return normalized;
    } catch {
      this.ubicacionErrorMessage = 'No se pudieron cargar las provincias del departamento seleccionado.';
      this.provincias.set([]);
      return [];
    } finally {
      this.isLoadingProvincias.set(false);
    }
  }

  private async loadDistritosAsync(departamento: string, provincia: string): Promise<string[]> {
    this.isLoadingDistritos.set(true);
    try {
      const distritos = await firstValueFrom(this.ubigeos.listarDistritos(departamento, provincia));
      const normalized = this.normalizeCatalogValues(distritos);
      this.distritos.set(normalized);
      return normalized;
    } catch {
      this.ubicacionErrorMessage = 'No se pudieron cargar los distritos de la provincia seleccionada.';
      this.distritos.set([]);
      return [];
    } finally {
      this.isLoadingDistritos.set(false);
    }
  }

  private async consultarUbigeoAsync(
    departamento: string,
    provincia: string,
    distrito: string,
    fallbackUbigeo = '',
  ): Promise<boolean> {
    const normalizedDepartamento = this.normalizeLocationText(departamento);
    const normalizedProvincia = this.normalizeLocationText(provincia);
    const normalizedDistrito = this.normalizeLocationText(distrito);
    const normalizedFallback = this.normalizeUbigeoValue(fallbackUbigeo);

    if (!normalizedDepartamento || !normalizedProvincia || !normalizedDistrito) {
      return false;
    }

    this.isConsultandoUbigeo.set(true);
    this.ubicacionErrorMessage = null;
    this.ubicacionInfoMessage = 'Consultando ubigeo...';

    try {
      const response = await firstValueFrom(
        this.ubigeos.consultarCodigoUbigeo(normalizedDepartamento, normalizedProvincia, normalizedDistrito),
      );
      const departamento = this.ensureCatalogOption(
        this.departamentos(),
        response.departamento,
        (items) => this.departamentos.set(items),
      );
      const provincia = this.ensureCatalogOption(this.provincias(), response.provincia, (items) => this.provincias.set(items));
      const distrito = this.ensureCatalogOption(this.distritos(), response.distrito, (items) => this.distritos.set(items));
      this.form.patchValue(
        {
          departamento,
          provincia,
          distrito,
          ubigeo: response.ubigeo,
        },
        { emitEvent: false },
      );
      this.ubicacionInfoMessage =
        normalizedFallback && normalizedFallback !== response.ubigeo
          ? 'Ubigeo validado con el catalogo interno. Se priorizo el codigo oficial.'
          : 'Ubigeo obtenido correctamente.';
      return true;
    } catch {
      if (normalizedFallback) {
        this.form.controls.ubigeo.setValue(normalizedFallback, { emitEvent: false });
        this.ubicacionErrorMessage =
          'No se encontro coincidencia exacta en el catalogo de ubigeo. Verifique departamento, provincia y distrito.';
        this.ubicacionInfoMessage = null;
        return true;
      }

      this.form.controls.ubigeo.setValue('', { emitEvent: false });
      this.ubicacionErrorMessage = 'No se encontro ubigeo para la ubicacion seleccionada.';
      this.ubicacionInfoMessage = null;
      return false;
    } finally {
      this.isConsultandoUbigeo.set(false);
    }
  }

  private handleRucLookupError(error: HttpErrorResponse): void {
    this.rucInfoMessage = null;
    this.rucAptoMensaje = null;

    if (error.status === 404) {
      this.rucErrorMessage = 'No se encontraron datos para el RUC ingresado. Completa la informacion manualmente.';
      return;
    }

    if (error.status === 400) {
      this.rucErrorMessage = error.error?.message ?? 'El RUC ingresado no es valido para consulta.';
      return;
    }

    this.rucErrorMessage = 'No fue posible consultar el RUC en este momento. Puedes continuar el registro manualmente.';
  }

  private resetRucMessages(): void {
    this.rucInfoMessage = null;
    this.rucErrorMessage = null;
    this.rucAptoMensaje = null;
  }

  private clearUbigeoMessages(): void {
    this.ubicacionInfoMessage = null;
    this.ubicacionErrorMessage = null;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get title(): string {
    return this.data.mode === 'create' ? 'Nuevo cliente' : 'Actualizar cliente';
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (!this.canSubmit) {
      return;
    }

    const hasUbigeo = await this.ensureUbigeoBeforeSubmit();
    if (!hasUbigeo || this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const idVendedorAsignado = this.permissions.isSeller()
      ? this.permissions.currentUserId() ?? value.idVendedorAsignado
      : value.idVendedorAsignado;
    const payload: ClienteCreateRequest | ClienteUpdateRequest = {
      ruc: value.ruc,
      razonSocial: value.razonSocial,
      idTipoCliente: value.idTipoCliente,
      idVendedorAsignado,
      direccionFiscal: value.direccionFiscal,
      departamento: value.departamento,
      provincia: value.provincia,
      distrito: value.distrito,
      condicionSunat: value.condicionSunat,
      estadoSunat: value.estadoSunat,
      ubigeo: value.ubigeo,
      idEstadoClienteContacto: value.idEstadoClienteContacto,
    };
    this.dialogRef.close(payload);
  }

  cancel(): void {
    this.dialogRef.close();
  }

  private async ensureUbigeoBeforeSubmit(): Promise<boolean> {
    const departamento = this.form.controls.departamento.value;
    const provincia = this.form.controls.provincia.value;
    const distrito = this.form.controls.distrito.value;
    const ubigeo = this.form.controls.ubigeo.value;

    if (!departamento || !provincia || !distrito) {
      this.ubicacionErrorMessage = 'Seleccione departamento, provincia y distrito.';
      return false;
    }

    if (/^\d{6}$/.test(ubigeo)) {
      return true;
    }

    const found = await this.consultarUbigeoAsync(departamento, provincia, distrito);
    if (!found) {
      this.ubicacionErrorMessage =
        'No se puede guardar el cliente porque no se pudo determinar el ubigeo. Seleccione nuevamente departamento, provincia y distrito.';
    }
    return found;
  }

  private loadCatalogos(): void {
    this.isLoadingCatalogos.set(true);
    this.catalogoError.set(null);
    this.vendedoresError.set(null);
    this.estadoActivoError.set(null);

    forkJoin({
      tiposCliente: this.catalogos.tiposClienteActivos().pipe(
        catchError(() => {
          this.catalogoError.set('No se pudieron cargar los tipos de cliente.');
          return of([] as CatalogoItem[]);
        }),
      ),
      estadosClienteContacto: this.catalogos.estadosClienteContacto().pipe(
        catchError(() => {
          this.estadoActivoError.set('No se pudo determinar el estado inicial del cliente.');
          return of([] as CatalogoItem[]);
        }),
      ),
      vendedores: (this.permissions.isSeller() ? of(this.currentUserAsVendedor()) : this.domainApi.getVendedores()).pipe(
        catchError(() => {
          this.vendedoresError.set('No se pudieron cargar los vendedores disponibles.');
          return of([] as VendedorResponse[]);
        }),
      ),
    })
      .pipe(
        finalize(() => this.isLoadingCatalogos.set(false)),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: ({ tiposCliente, estadosClienteContacto, vendedores }) => {
          this.tiposCliente.set(tiposCliente);
          this.estadosClienteContacto.set(estadosClienteContacto);
          this.vendedores.set(this.filterVendedores(vendedores));
          this.applyDefaultCatalogValues(tiposCliente, estadosClienteContacto, this.vendedores());
        },
      });
  }

  private applyDefaultCatalogValues(
    tiposCliente: CatalogoItem[],
    estadosClienteContacto: CatalogoItem[],
    vendedores: VendedorResponse[],
  ): void {
    if (!tiposCliente.length) {
      this.catalogoError.set('No existen tipos de cliente activos configurados.');
    }

    if (!vendedores.length) {
      this.vendedoresError.set('No existen vendedores habilitados para asignar al cliente.');
    }

    if (!this.form.controls.idTipoCliente.value && tiposCliente[0]) {
      this.form.controls.idTipoCliente.setValue(tiposCliente[0].id);
    }

    const estadoActivo = this.findEstadoActivo(estadosClienteContacto);
    if (!estadoActivo) {
      this.estadoActivoError.set('No se pudo determinar el estado inicial del cliente.');
    } else if (!this.form.controls.idEstadoClienteContacto.value || this.isCreateMode) {
      this.form.controls.idEstadoClienteContacto.setValue(estadoActivo.id);
    }

    if (!this.form.controls.idVendedorAsignado.value && vendedores[0]) {
      this.form.controls.idVendedorAsignado.setValue(vendedores[0].idUsuario);
    }
  }

  private filterVendedores(usuarios: VendedorResponse[]): VendedorResponse[] {
    if (this.permissions.isSeller()) {
      return usuarios.filter((usuario) => usuario.idUsuario === this.permissions.currentUserId());
    }
    const cleaned = usuarios.filter((usuario) => !!(usuario.nombres ?? '').trim());
    this.vendedoresError.set(cleaned.length ? null : 'No existen vendedores habilitados para asignar al cliente.');
    return cleaned;
  }

  private findEstadoActivo(estadosClienteContacto: CatalogoItem[]): CatalogoItem | undefined {
    return estadosClienteContacto.find((item) => item.descripcion.trim().toLowerCase() === 'activo');
  }

  private currentUserAsVendedor(): VendedorResponse[] {
    const user = this.auth.currentUser();
    return user
      ? [
          {
            idUsuario: user.idUsuario,
            nombres: user.nombres,
            apellidoPaterno: user.apellidoPaterno,
            apellidoMaterno: user.apellidoMaterno,
            nombreCompleto: [user.nombres, user.apellidoPaterno, user.apellidoMaterno].filter(Boolean).join(' '),
            correo: user.correo,
          },
        ]
      : [];
  }

  private patchClienteValues(cliente: ClienteResponseVm): void {
    this.isSyncingUbigeo = true;
    this.form.patchValue(
      {
        ruc: cliente.ruc,
        razonSocial: cliente.razonSocial,
        idTipoCliente: cliente.idTipoCliente ?? 0,
        idVendedorAsignado: cliente.idVendedorAsignado ?? 0,
        direccionFiscal: cliente.direccionFiscal ?? '',
        departamento: this.normalizeLocationText(cliente.departamento),
        provincia: this.normalizeLocationText(cliente.provincia),
        distrito: this.normalizeLocationText(cliente.distrito),
        condicionSunat: cliente.condicionSunat ?? 'HABIDO',
        estadoSunat: cliente.estadoSunat ?? 'ACTIVO',
        ubigeo: this.normalizeUbigeoValue(cliente.ubigeo),
        idEstadoClienteContacto: cliente.estado?.id ?? 0,
      },
      { emitEvent: false },
    );
    this.isSyncingUbigeo = false;
  }

  private pickCatalogValue(
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
    this.ubicacionErrorMessage =
      'No se encontro coincidencia exacta en el catalogo de ubigeo. Verifique departamento, provincia y distrito.';
    return normalized;
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
}
