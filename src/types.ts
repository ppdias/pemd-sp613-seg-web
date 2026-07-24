/**
 * Shared types for PEMD SP613-Seg Dashboard Web
 */

export interface User {
  id: string;
  name: string;
  login: string;
  passw: string;
  email?: string;
  group: string; // "Vigilante", "Monitor", "Supervisor", "Gestor", "Admin", "Super_saiyajin_instinto_superior"
  userGPS?: number;
  userGPSRadius?: number;
  userGPSUpdateInsideRadius?: number;
  userLocationAndNetworkCheck?: number;
  userOwner?: string;
  userCanIa?: string; // "sim" | "não"
  userCanVideo?: string; // "sim" | "não"
  userCanAudio?: string; // "sim" | "não"
  userCanImage?: string; // "sim" | "não"
  userCanText?: string; // "sim" | "não"
  userCanQRCode?: string; // "sim" | "não"
  userCanTag?: string; // "sim" | "não"
  userCanSMS?: string; // "sim" | "não"
  userCanWhats?: string; // "sim" | "não"
  userCanImageNumber?: number;
  userCanVideoNumber?: number;
  userCanAudioNumber?: number;
  needsProfileUpdate?: boolean;
  license: string; // "Ativa" | "Expirada"
  photo: string;
  licenseTime: string; // "Ilimitada" | "Dia" | "Semana" | "Mês" | "Ano"
  licenseTimeUpdate: number; // timestamp
  activeSessionId?: string;
  activeMachineId?: string;
  registrationTimestamp: number;
  lastUpdate?: any;
  gender: string; // "masculino" | "feminino"
  userCompany?: string;
  supervisor?: string;
  userCanTest?: string;
  storageLocation?: string;
  digitalList?: string[];
  workDayStart?: string;
  workDayEnd?: string;
  latitude?: number;
  longitude?: number;
}

export interface LogEntry {
  id: string;
  userId: string;
  userName: string;
  userGroup: string;
  eventType: string; // "login", "logout", "alerta", "inserção", "alteração", "deleção", etc.
  description: string;
  timestamp: number;
  date: string;
  hour: string;
  machineId: string;
  ipAddress: string;
  phisicalAddress?: string;
  latlong: string; // "latitude,longitude"
  latlongAddress?: string;
  targetTable?: string;
  targetId?: string;
  changes?: string;
  rfc5424Standard?: string;
  userAgent?: string;
}

export interface RoutePoint {
  id: string;
  userId: string;
  routeId: string;
  userName: string;
  sector: string;
  vehicle: string;
  people: string;
  notes: string;
  latlong: string; // "latitude,longitude"
  date: string;
  hour: string;
  status: string;
  timestamp: number;
}

export interface Event {
  id: string;
  userId: string;
  userName: string;
  routeId: string;
  sector: string;
  vehicle: string;
  people: string;
  observacao: string;
  notes: string;
  latlong: string; // "latitude,longitude"
  date: string;
  hour: string;
  timestamp: number;
  media?: string[];
  images?: string[];
  videos?: string[];
  audios?: string[];
  texts?: string[];
}
