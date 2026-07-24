import { RoutePoint, Event } from "../types";

interface DMS {
  degrees: number;
  minutes: number;
  seconds: string;
}

/**
 * Converts Decimal Degrees (e.g., -23.5520) to DMS (Degrees, Minutes, Seconds)
 */
export function convertDecimalToDMS(decimal: number): DMS {
  const isNegative = decimal < 0;
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(2).replace(".", ",");
  
  return {
    degrees: isNegative ? -degrees : degrees,
    minutes,
    seconds
  };
}

/**
 * Extracts day of month from DD/MM/YYYY date string
 */
function getDayOfMonth(dateStr: string): string {
  if (!dateStr) return String(new Date().getDate());
  const parts = dateStr.split("/");
  if (parts.length > 0 && parts[0]) {
    return parts[0];
  }
  return String(new Date().getDate());
}

/**
 * Maps vehicle type to ATIVIDADE category
 */
function getAtividade(vehicle: string): string {
  const v = (vehicle || "").toLowerCase();
  if (v.includes("carro") || v.includes("viatura")) {
    return "Carros vistoriados";
  }
  if (v.includes("barco") || v.includes("embarca")) {
    return "Embarcações vistoriadas";
  }
  if (v.includes("moto")) {
    return "Motos vistoriadas";
  }
  return "Patrulha a pé realizada";
}

/**
 * Maps vehicle type to hardcoded QUANTIDADE value
 */
function getQuantidade(vehicle: string): string {
  const v = (vehicle || "").toLowerCase();
  if (v.includes("carro") || v.includes("viatura") || v.includes("barco") || v.includes("embarca")) {
    return "100";
  }
  if (v.includes("moto")) {
    return "50";
  }
  return "10";
}

/**
 * Formats CSV cells array into double-quote wrapped line
 */
function formatCSVRow(cells: string[]): string {
  return cells
    .map((cell) => {
      const cleaned = (cell || "").replace(/"/g, '""');
      return `"${cleaned}"`;
    })
    .join(",");
}

/**
 * Export data matching environmental SIMUC (ICMBio) 26-column standard format.
 * Groups route points by routeId (1 row per route) and maps events to 1 row each.
 */
export function exportToSimucCSV({
  routes,
  events,
  currentUserLogin = "admin",
}: {
  routes: RoutePoint[];
  events: Event[];
  currentUserLogin: string;
}) {
  const headers = [
    "Id",
    "TIPO",
    "ATIVIDADE",
    "QUANTIDADE",
    "UNIDADE",
    "TIPO DOCUMENTO",
    "N. DO DOCUMENTO",
    "GPS",
    "LATITUDE GRAUS",
    "LATITUDE MINUTOS",
    "LATITUDE SEGUNDOS",
    "LONGITUDE GRAUS",
    "LONGITUDE MINUTOS",
    "LONGITUDE SEGUNDOS",
    "DATA",
    "CODIGO TIPIFICACAO",
    "TIPO DE OPERAÇÃO",
    "SETOR",
    "ESFORÇO",
    "APREENSÃO",
    "HORA INÍCIO",
    "MINUTO INÍCIO",
    "HORA FIM",
    "MINUTO FIM",
    "MOTIVAÇÃO",
    "OBSERVAÇÃO",
  ];

  const rows: string[] = [];
  rows.push(formatCSVRow(headers));

  // --- 1. GROUP ROUTES BY ROUTE ID ---
  const routeGroups: { [routeId: string]: RoutePoint[] } = {};
  routes.forEach((pt) => {
    if (!pt.routeId) return;
    if (!routeGroups[pt.routeId]) {
      routeGroups[pt.routeId] = [];
    }
    routeGroups[pt.routeId].push(pt);
  });

  // Process each route group
  Object.entries(routeGroups).forEach(([routeId, pts]) => {
    // Sort points by timestamp / chronological order
    const sortedPts = [...pts].sort((a, b) => a.timestamp - b.timestamp);
    if (sortedPts.length === 0) return;

    const firstPt = sortedPts[0];
    const lastPt = sortedPts[sortedPts.length - 1];

    const vehicle = firstPt.vehicle || "A pé";
    const sector = firstPt.sector || "Geral";
    const dateStr = firstPt.date || "";
    const uniqueNotes = Array.from(new Set(sortedPts.map(p => p.notes).filter(Boolean)));
    const notesStr = uniqueNotes.join(" | ") || firstPt.notes || "Patrulha de rotina sem observações";

    // GPS coordinates from the starting point
    let gpsStr = "";
    let latDeg = "", latMin = "", latSec = "";
    let lngDeg = "", lngMin = "", lngSec = "";

    if (firstPt.latlong) {
      gpsStr = firstPt.latlong;
      const parts = firstPt.latlong.split(",");
      if (parts.length === 2) {
        const lat = Number(parts[0]);
        const lng = Number(parts[1]);
        if (!isNaN(lat)) {
          const latDms = convertDecimalToDMS(lat);
          latDeg = String(latDms.degrees);
          latMin = String(latDms.minutes);
          latSec = latDms.seconds;
        }
        if (!isNaN(lng)) {
          const lngDms = convertDecimalToDMS(lng);
          lngDeg = String(lngDms.degrees);
          lngMin = String(lngDms.minutes);
          lngSec = lngDms.seconds;
        }
      }
    }

    // Time parsing
    let startHour = "00", startMin = "00";
    let endHour = "00", endMin = "00";

    if (firstPt.hour) {
      const parts = firstPt.hour.split(":");
      startHour = parts[0] || "00";
      startMin = parts[1] || "00";
    }
    if (lastPt.hour) {
      const parts = lastPt.hour.split(":");
      endHour = parts[0] || "00";
      endMin = parts[1] || "00";
    }

    const documentNo = `${vehicle} - ${getDayOfMonth(dateStr)}`;

    const columns = [
      routeId,                             // 1. Id
      "AÇÕES",                             // 2. TIPO
      getAtividade(vehicle),               // 3. ATIVIDADE
      getQuantidade(vehicle),              // 4. QUANTIDADE
      "Unidade de Conservação",            // 5. UNIDADE
      "DOCUMENTO da UC",                   // 6. TIPO DOCUMENTO
      documentNo,                          // 7. N. DO DOCUMENTO
      gpsStr,                              // 8. GPS
      latDeg,                              // 9. LATITUDE GRAUS
      latMin,                              // 10. LATITUDE MINUTOS
      latSec,                              // 11. LATITUDE SEGUNDOS
      lngDeg,                              // 12. LONGITUDE GRAUS
      lngMin,                              // 13. LONGITUDE MINUTOS
      lngSec,                              // 14. LONGITUDE SEGUNDOS
      dateStr,                             // 15. DATA
      "PEMD-SP613",                        // 16. CODIGO TIPIFICACAO
      "Operação de Rotina da UC",          // 17. TIPO DE OPERAÇÃO
      sector,                              // 18. SETOR
      "1",                                 // 19. ESFORÇO (1 patrulha de rotas)
      "Não",                               // 20. APREENSÃO
      startHour,                           // 21. HORA INÍCIO
      startMin,                           // 22. MINUTO INÍCIO
      endHour,                             // 23. HORA FIM
      endMin,                              // 24. MINUTO FIM
      "ROTINA/PLANEJAMENTO",               // 25. MOTIVAÇÃO
      `Rota de patrulhamento: ${notesStr}`, // 26. OBSERVAÇÃO
    ];

    rows.push(formatCSVRow(columns));
  });

  // --- 2. PROCESS EVENTS (ALERTS) ---
  events.forEach((evt) => {
    const associatedRoutePoints = routes.filter(r => r.routeId === evt.routeId);
    const hasRoute = associatedRoutePoints.length > 0;
    
    // Find complementary route info or fallback to event info
    const vehicle = evt.vehicle || (hasRoute ? associatedRoutePoints[0].vehicle : "A pé");
    const sector = evt.sector || (hasRoute ? associatedRoutePoints[0].sector : "Geral");
    const dateStr = evt.date || "";
    
    let gpsStr = "";
    let latDeg = "", latMin = "", latSec = "";
    let lngDeg = "", lngMin = "", lngSec = "";

    if (evt.latlong) {
      gpsStr = evt.latlong;
      const parts = evt.latlong.split(",");
      if (parts.length === 2) {
        const lat = Number(parts[0]);
        const lng = Number(parts[1]);
        if (!isNaN(lat)) {
          const latDms = convertDecimalToDMS(lat);
          latDeg = String(latDms.degrees);
          latMin = String(latDms.minutes);
          latSec = latDms.seconds;
        }
        if (!isNaN(lng)) {
          const lngDms = convertDecimalToDMS(lng);
          lngDeg = String(lngDms.degrees);
          lngMin = String(lngDms.minutes);
          lngSec = lngDms.seconds;
        }
      }
    }

    // Time parsing for event
    let startHour = "00", startMin = "00";
    if (evt.hour) {
      const parts = evt.hour.split(":");
      startHour = parts[0] || "00";
      startMin = parts[1] || "00";
    }

    // If associated route exists, we can get route end times
    let endHour = startHour;
    let endMin = startMin;
    if (hasRoute) {
      const sortedRoutePts = [...associatedRoutePoints].sort((a, b) => a.timestamp - b.timestamp);
      const lastRoutePt = sortedRoutePts[sortedRoutePts.length - 1];
      if (lastRoutePt && lastRoutePt.hour) {
        const parts = lastRoutePt.hour.split(":");
        endHour = parts[0] || "00";
        endMin = parts[1] || "00";
      }
    }

    const documentNo = `${vehicle} - ${getDayOfMonth(dateStr)}`;
    const observationStr = `OCORRÊNCIA: ${evt.observacao || ""}. Notas: ${evt.notes || ""}`;

    const columns = [
      evt.id,                              // 1. Id
      "AÇÕES",                             // 2. TIPO
      getAtividade(vehicle),               // 3. ATIVIDADE
      getQuantidade(vehicle),              // 4. QUANTIDADE
      "Unidade de Conservação",            // 5. UNIDADE
      "DOCUMENTO da UC",                   // 6. TIPO DOCUMENTO
      documentNo,                          // 7. N. DO DOCUMENTO
      gpsStr,                              // 8. GPS
      latDeg,                              // 9. LATITUDE GRAUS
      latMin,                              // 10. LATITUDE MINUTOS
      latSec,                              // 11. LATITUDE SEGUNDOS
      lngDeg,                              // 12. LONGITUDE GRAUS
      lngMin,                              // 13. LONGITUDE MINUTOS
      lngSec,                              // 14. LONGITUDE SEGUNDOS
      dateStr,                             // 15. DATA
      "PEMD-SP613",                        // 16. CODIGO TIPIFICACAO
      "Operação de Rotina da UC",          // 17. TIPO DE OPERAÇÃO
      sector,                              // 18. SETOR
      "1",                                 // 19. ESFORÇO
      "Não",                               // 20. APREENSÃO
      startHour,                           // 21. HORA INÍCIO
      startMin,                           // 22. MINUTO INÍCIO
      endHour,                             // 23. HORA FIM
      endMin,                              // 24. MINUTO FIM
      "ROTINA/PLANEJAMENTO",               // 25. MOTIVAÇÃO
      observationStr,                      // 26. OBSERVAÇÃO
    ];

    rows.push(formatCSVRow(columns));
  });

  // Create file content with UTF-8 byte-order mark (BOM) for excel compatibility
  const csvContent = "\uFEFF" + rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  // Generate nice filename: simuc-{login}-rotas-exportadas-{data-hora}.csv
  const now = new Date();
  const formatDigit = (n: number) => String(n).padStart(2, "0");
  const dateFormatted = `${now.getFullYear()}${formatDigit(now.getMonth() + 1)}${formatDigit(now.getDate())}`;
  const timeFormatted = `${formatDigit(now.getHours())}${formatDigit(now.getMinutes())}`;
  const filename = `simuc-${currentUserLogin}-rotas-exportadas-${dateFormatted}-${timeFormatted}.csv`;

  // Download Link
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
