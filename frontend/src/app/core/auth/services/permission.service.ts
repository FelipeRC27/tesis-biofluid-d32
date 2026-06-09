import { Injectable, computed, inject } from '@angular/core';
import { ClienteResponseVm } from '../../models/cliente.models';
import { AuthService } from './auth.service';

export type AppRole = 'SISTEMAS' | 'GERENTE' | 'JEFE_VENTAS' | 'VENDEDOR' | 'ADMINISTRATIVO' | 'ADMIN';

const FULL_ACCESS: AppRole[] = ['SISTEMAS', 'GERENTE', 'ADMINISTRATIVO', 'ADMIN'];

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly auth = inject(AuthService);

  readonly currentRole = computed(() => this.normalizeRole(this.auth.currentUser()?.perfil?.nombre) as AppRole | '');

  hasRole(role: AppRole | string): boolean {
    return this.currentRole() === this.normalizeRole(role);
  }

  hasAnyRole(roles: Array<AppRole | string>): boolean {
    return roles.map((role) => this.normalizeRole(role)).includes(this.currentRole());
  }

  isFullAccess(): boolean {
    return this.hasAnyRole(FULL_ACCESS);
  }

  isSalesManager(): boolean {
    return this.hasRole('JEFE_VENTAS');
  }

  isSeller(): boolean {
    return this.hasRole('VENDEDOR');
  }

  currentUserId(): number | null {
    return this.auth.currentUser()?.idUsuario ?? null;
  }

  canAccessUsers(): boolean {
    return this.isFullAccess();
  }

  canEditProducts(): boolean {
    return this.isFullAccess();
  }

  canEditPrices(): boolean {
    return this.isFullAccess();
  }

  canManageClients(): boolean {
    return this.isFullAccess() || this.isSalesManager();
  }

  canCreateClient(): boolean {
    return this.canManageClients() || this.isSeller();
  }

  canEditClient(cliente: Pick<ClienteResponseVm, 'idVendedorAsignado'>): boolean {
    if (this.canManageClients()) {
      return true;
    }
    return this.isSeller() && cliente.idVendedorAsignado === this.currentUserId();
  }

  canChangeClientStatus(): boolean {
    return this.canManageClients();
  }

  canViewAllSellers(): boolean {
    return this.isFullAccess() || this.isSalesManager();
  }

  canViewSellerFilter(): boolean {
    return this.canViewAllSellers();
  }

  shouldForceCurrentSeller(): boolean {
    return this.isSeller();
  }

  canViewAllQuotations(): boolean {
    return this.canViewAllSellers();
  }

  canCreateQuotation(): boolean {
    return this.hasAnyRole(['SISTEMAS', 'GERENTE', 'ADMINISTRATIVO', 'JEFE_VENTAS', 'VENDEDOR', 'ADMIN']);
  }

  canEditQuotation(): boolean {
    return this.canCreateQuotation();
  }

  private normalizeRole(value: string | null | undefined): string {
    const normalized = (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
    return normalized === 'JEFE_DE_VENTAS' ? 'JEFE_VENTAS' : normalized;
  }
}
