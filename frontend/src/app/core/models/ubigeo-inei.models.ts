export interface UbigeoResponse {
  idUbigeoInei: number;
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  flagCobertura: number;
  tieneCobertura: boolean;
}

export interface UbigeoCoberturaResponse {
  ubigeo: string;
  flagCobertura: number;
  tieneCobertura: boolean;
}
