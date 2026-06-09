export const API_ENDPOINTS = {
  auth: {
    login: '/auth/login',
    me: '/auth/me',
  },
  usuarios: '/usuarios',
  usuariosVendedores: '/usuarios/vendedores',
  perfiles: '/perfiles',
  tiposDocumento: '/tipos-documento',
  documentos: '/v1/documentos',
  v1: {
    catalogos: '/v1/catalogos',
    clientes: '/v1/clientes',
    ubigeos: '/v1/ubigeos',
    tiposCliente: '/v1/tipos-cliente',
    productos: '/v1/productos',
    cotizaciones: '/v1/cotizaciones',
    preciosTipoCliente: '/v1/precios-tipo-cliente',
    dashboard: '/v1/dashboard',
    reportes: '/v1/reportes',
  },
} as const;
