import React from "react";
import { RoutePoint, User, Event } from "../types";
import { 
  Navigation, 
  MapPin, 
  User as UserIcon, 
  Calendar, 
  Clock, 
  Compass,
  Filter, 
  Car,
  Eye,
  CheckCircle2,
  Download,
  Search
} from "lucide-react";
import { exportToSimucCSV } from "../utils/csvExporter";
import logoImg from "../logoBeforeSplashScreen.png";

interface RoutesViewerProps {
  routes: RoutePoint[];
  users: User[];
  events?: Event[];
  currentUserLogin?: string;
  // Filter States
  selectedSector: string;
  setSelectedSector: (sector: string) => void;
  selectedUser: string;
  setSelectedUser: (user: string) => void;
  selectedStartDate: string;
  setSelectedStartDate: (date: string) => void;
  selectedEndDate: string;
  setSelectedEndDate: (date: string) => void;
  // Selection State
  selectedRouteId: string | null;
  onSelectRouteId: (routeId: string | null) => void;
  selectedAlertId?: string | null;
  onClearSelectedAlertId?: () => void;
}

function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  // If in format "DD/MM/YYYY"
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
  }
  // If in format "YYYY-MM-DD"
  if (dateStr.includes("-")) {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
  }
  return null;
}

function getRouteSearchableText(route: RoutePoint, users: User[]): string {
  const dbUser = users.find((u) => u.login === route.userName || u.id === route.userId);
  const userNameDisplay = dbUser ? dbUser.name : "";
  const userEmailDisplay = dbUser?.email || "";
  const userGroupDisplay = dbUser?.group || "";

  return [
    route.id || "",
    route.userId || "",
    route.routeId || "",
    route.userName || "",
    userNameDisplay,
    userEmailDisplay,
    userGroupDisplay,
    route.sector || "",
    route.vehicle || "",
    route.people || "",
    route.notes || "",
    route.latlong || "",
    route.date || "",
    route.hour || "",
    route.status || "",
  ]
    .map((val) => val.toString().toLowerCase())
    .join(" ");
}

function evaluateBooleanQuery(text: string, queryStr: string): boolean {
  const query = queryStr.trim();
  if (!query) return true;

  // Split by "OU" (case-insensitive with spacing)
  const orBlocks = query.split(/\s+OU\s+/i);

  // At least one OR block must be true
  return orBlocks.some((orBlock) => {
    // Split by "E" (case-insensitive with spacing)
    const andBlocks = orBlock.split(/\s+E\s+/i);

    // ALL and-blocks must be true
    return andBlocks.every((andBlock) => {
      const trimmedBlock = andBlock.trim();
      if (!trimmedBlock) return true;

      // Check if starts with "NÃO" or "NAO" (case-insensitive with trailing space)
      const notMatch = trimmedBlock.match(/^(NÃO|NAO)\s+(.+)$/i);
      if (notMatch) {
        const term = notMatch[2].trim().toLowerCase();
        if (!term) return true;
        return !text.includes(term);
      }

      return text.includes(trimmedBlock.toLowerCase());
    });
  });
}

export default function RoutesViewer({ 
  routes, 
  users,
  events = [],
  currentUserLogin = "admin",
  selectedSector,
  setSelectedSector,
  selectedUser,
  setSelectedUser,
  selectedStartDate,
  setSelectedStartDate,
  selectedEndDate,
  setSelectedEndDate,
  selectedRouteId,
  onSelectRouteId,
  selectedAlertId,
  onClearSelectedAlertId
}: RoutesViewerProps) {

  // Resolve the route associated with the selected alert, if any
  const selectedAlert = selectedAlertId ? (events || []).find((e) => e.id === selectedAlertId) : null;
  const alertRouteId = selectedAlert ? selectedAlert.routeId : null;

  const [searchTerm, setSearchTerm] = React.useState<string>("");

  // Get Unique values for filter dropdowns from ALL routes
  const uniqueSectors = Array.from(new Set(routes.map((r) => r.sector || "Setor Geral"))).filter(Boolean);
  const uniqueUsers = Array.from(new Set(routes.map((r) => r.userName || r.userId))).filter(Boolean);

  // Filter routes
  const filteredRoutes = routes.filter((route) => {
    // Sector Filter
    if (selectedSector !== "todos" && route.sector !== selectedSector) {
      return false;
    }

    // User Filter
    if (selectedUser !== "todos" && route.userName !== selectedUser && route.userId !== selectedUser) {
      return false;
    }

    // Date Period Filters
    if (selectedStartDate) {
      const startObj = parseDateString(selectedStartDate);
      const routeObj = parseDateString(route.date);
      if (startObj && routeObj) {
        startObj.setHours(0, 0, 0, 0);
        routeObj.setHours(0, 0, 0, 0);
        if (routeObj < startObj) {
          return false;
        }
      }
    }

    if (selectedEndDate) {
      const endObj = parseDateString(selectedEndDate);
      const routeObj = parseDateString(route.date);
      if (endObj && routeObj) {
        endObj.setHours(0, 0, 0, 0);
        routeObj.setHours(0, 0, 0, 0);
        if (routeObj > endObj) {
          return false;
        }
      }
    }

    // Route ID Filter (Selected on Map)
    if (selectedRouteId && route.routeId !== selectedRouteId) {
      return false;
    }

    // Alert Route ID Filter (From selected Alert on Map)
    if (alertRouteId && route.routeId !== alertRouteId) {
      return false;
    }

    // Boolean Search Filter
    if (searchTerm.trim()) {
      const searchableText = getRouteSearchableText(route, users);
      if (!evaluateBooleanQuery(searchableText, searchTerm)) {
        return false;
      }
    }

    return true;
  });

  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [pageSize, setPageSize] = React.useState<number>(50);

  // Sort by timestamp descending
  const sortedRoutes = [...filteredRoutes].sort((a, b) => b.timestamp - a.timestamp);

  // Pagination bounds calculation
  const totalPages = Math.ceil(sortedRoutes.length / pageSize) || 1;
  const activePage = Math.min(currentPage, totalPages);
  const paginatedRoutes = sortedRoutes.slice((activePage - 1) * pageSize, activePage * pageSize);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedSector, selectedUser, selectedStartDate, selectedEndDate, selectedRouteId, selectedAlertId, searchTerm]);

  // Stats
  const totalPoints = filteredRoutes.length;
  const activeRoutesCount = Array.from(new Set(filteredRoutes.map((r) => r.routeId))).length;
  const uniqueVigilantesInRoute = Array.from(new Set(filteredRoutes.map((r) => r.userName))).length;

  // Clear filters
  const handleClearFilters = () => {
    setSelectedSector("todos");
    setSelectedUser("todos");
    setSelectedStartDate("");
    setSelectedEndDate("");
    setSearchTerm("");
    onSelectRouteId(null);
    if (selectedAlertId && onClearSelectedAlertId) {
      onClearSelectedAlertId();
    }
  };

  // Helper for generating page numbers
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      const start = Math.max(2, activePage - 1);
      const end = Math.min(totalPages - 1, activePage + 1);
      if (start > 2) {
        pages.push("...");
      }
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < totalPages - 1) {
        pages.push("...");
      }
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div id="routes-viewer-container" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-lg h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-cyan-600 animate-spin-slow" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Patrulhas e Rotas</h2>
            <p className="text-xs text-slate-500">Monitoramento histórico e tático dos checkpoints de patrulhas de vigilantes</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {selectedRouteId && (
            <span className="bg-purple-50 border border-purple-200 text-purple-700 text-xs font-mono px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
              <Eye className="w-3 h-3" /> Rota Selecionada no Mapa
            </span>
          )}
          {selectedAlertId && (
            <span className="bg-purple-50 border border-purple-200 text-purple-700 text-xs font-mono px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
              <Eye className="w-3 h-3" /> Rota do Alerta Selecionado
            </span>
          )}
          <span className="bg-cyan-50 border border-cyan-100 text-cyan-700 text-xs font-mono px-2.5 py-1 rounded-full font-bold">
            {activeRoutesCount} Rotas Ativas
          </span>
          <span className="bg-slate-100 text-slate-600 text-xs font-mono px-2.5 py-1 rounded-full">
            {totalPoints} Checkpoints
          </span>
          
          <button
            onClick={() => {
              exportToSimucCSV({
                routes: filteredRoutes,
                events: [],
                currentUserLogin: currentUserLogin,
              });
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl border border-emerald-500 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            title="Exportar dados operacionais formatados para o padrão de 26 colunas SIMUC/ICMBio"
          >
            <Download className="w-3.5 h-3.5" /> Exportar SIMUC (CSV)
          </button>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold">Total de Checkpoints</p>
            <p className="text-2xl font-black text-slate-800">{totalPoints}</p>
          </div>
          <MapPin className="w-8 h-8 text-cyan-500/50" />
        </div>
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold">Identificadores de Rota</p>
            <p className="text-2xl font-black text-slate-800">{activeRoutesCount}</p>
          </div>
          <Navigation className="w-8 h-8 text-purple-500/50" />
        </div>
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold">Usuários na Operação</p>
            <p className="text-2xl font-black text-slate-800">{uniqueVigilantesInRoute}</p>
          </div>
          <UserIcon className="w-8 h-8 text-emerald-500/50" />
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase font-mono">
            <Filter className="w-4 h-4 text-cyan-600" />
            <span>Filtros Operacionais</span>
          </div>
        </div>

        {/* Search Input Box */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block">
            Busca Inteligente (Operadores: E, OU, NÃO)
          </label>
          <div className="relative">
            <input
              id="routes-search-input"
              type="text"
              placeholder='Exemplo: "anta E onça" (ambas), "anta OU onça" (qualquer uma), "NÃO onça" (exclui onça)'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 pl-10 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/35 transition-all font-sans shadow-sm"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Sector Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block">Filtrar por Setor</label>
            <div className="relative">
              <select
                id="routes-filter-sector"
                value={selectedSector}
                onChange={(e) => {
                  setSelectedSector(e.target.value);
                  onSelectRouteId(null); // Reset single selection on filter change
                }}
                className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 pl-8 text-xs text-slate-700 focus:outline-none focus:border-cyan-500 transition-all font-sans appearance-none cursor-pointer shadow-sm"
              >
                <option value="todos">Todos os Setores</option>
                {uniqueSectors.map((sec) => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
              </select>
              <Compass className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* User Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block">Filtrar por Usuário</label>
            <div className="relative">
              <select
                id="routes-filter-user"
                value={selectedUser}
                onChange={(e) => {
                  setSelectedUser(e.target.value);
                  onSelectRouteId(null); // Reset single selection on filter change
                }}
                className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 pl-8 text-xs text-slate-700 focus:outline-none focus:border-cyan-500 transition-all font-sans appearance-none cursor-pointer shadow-sm"
              >
                <option value="todos">Todos os usuários</option>
                {uniqueUsers.map((user) => {
                  const dbUser = users.find((u) => u.login === user || u.id === user);
                  const displayLabel = dbUser ? `${dbUser.name} (${dbUser.login})` : user;
                  return (
                    <option key={user} value={user}>{displayLabel}</option>
                  );
                })}
              </select>
              <UserIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Date Start Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block">Data Inicial</label>
            <div className="relative">
              <input
                id="routes-filter-start-date"
                type="date"
                value={selectedStartDate}
                onChange={(e) => {
                  setSelectedStartDate(e.target.value);
                  onSelectRouteId(null); // Reset single selection on filter change
                }}
                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 pl-8 text-xs text-slate-700 focus:outline-none focus:border-cyan-500 transition-all font-sans cursor-pointer shadow-sm"
              />
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Date End Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase font-mono block">Data Final</label>
            <div className="relative">
              <input
                id="routes-filter-end-date"
                type="date"
                value={selectedEndDate}
                onChange={(e) => {
                  setSelectedEndDate(e.target.value);
                  onSelectRouteId(null); // Reset single selection on filter change
                }}
                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 pl-8 text-xs text-slate-700 focus:outline-none focus:border-cyan-500 transition-all font-sans cursor-pointer shadow-sm"
              />
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Clear Filter Button */}
        {(selectedSector !== "todos" || selectedUser !== "todos" || selectedStartDate !== "" || selectedEndDate !== "" || selectedRouteId || selectedAlertId || searchTerm !== "") && (
          <div className="flex justify-end pt-1">
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-700 font-bold bg-rose-50 border border-rose-100 hover:bg-rose-100/60 px-3 py-1 rounded-lg transition-all cursor-pointer"
            >
              Limpar Filtros Selecionados
            </button>
          </div>
        )}
      </div>

      {/* Map selection filter banner */}
      {(selectedRouteId || selectedAlertId) && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-4 flex items-center justify-between text-xs text-purple-950 animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
            <span>
              {selectedRouteId ? (
                <>Mostrando apenas checkpoints da <strong>rota selecionada no mapa</strong>.</>
              ) : (
                <>Mostrando apenas checkpoints da rota do <strong>alerta selecionado no mapa</strong>.</>
              )}
            </span>
          </div>
          <button
            onClick={() => {
              if (selectedRouteId) onSelectRouteId(null);
              if (selectedAlertId && onClearSelectedAlertId) onClearSelectedAlertId();
            }}
            className="text-[10px] font-extrabold uppercase font-mono text-purple-600 hover:text-purple-800 underline pl-2 cursor-pointer"
          >
            Mostrar todos
          </button>
        </div>
      )}

      {/* Routes List Table */}
      <div className="overflow-x-auto flex-grow custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase font-mono tracking-wider">
              <th className="py-3 px-4">Data / Horário</th>
              <th className="py-3 px-4">Usuário</th>
              <th className="py-3 px-4">Setor</th>
              <th className="py-3 px-4">Veículo</th>
              <th className="py-3 px-4">Terminal / Coordenadas</th>
              <th className="py-3 px-4">Notas</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {paginatedRoutes.map((route) => {
              const dbUser = users.find((u) => u.login === route.userName || u.id === route.userId);
              const isSelected = selectedRouteId === route.routeId;
              
              return (
                <tr 
                  key={route.id} 
                  onClick={() => onSelectRouteId(isSelected ? null : route.routeId)}
                  className={`transition-colors cursor-pointer ${
                    isSelected 
                      ? "bg-purple-50/80 hover:bg-purple-50 border-l-4 border-l-purple-500" 
                      : "hover:bg-slate-50/50"
                  }`}
                >
                  {/* Timestamp & Date */}
                  <td className="py-3 px-4 font-mono text-slate-500">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800">{route.date}</span>
                      <span className="text-[10px] flex items-center gap-1 mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {route.hour}
                      </span>
                    </div>
                  </td>

                  {/* Vigilante Operator */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <img 
                        src={dbUser?.photo || logoImg} 
                        alt={route.userName} 
                        className="w-6 h-6 rounded-full object-cover border border-slate-200"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{dbUser?.name || route.userName}</span>
                        <span className="text-[10px] font-mono text-slate-400">@{route.userName || "sistema"}</span>
                      </div>
                    </div>
                  </td>

                  {/* Sector */}
                  <td className="py-3 px-4 font-bold text-slate-700">
                    <span className="px-2.5 py-1 rounded bg-cyan-50/75 border border-cyan-100 text-[10px] uppercase font-mono text-cyan-800">
                      {route.sector || "Setor Geral"}
                    </span>
                  </td>

                  {/* Vehicle */}
                  <td className="py-3 px-4 text-slate-600">
                    <div className="flex items-center gap-1.5 font-sans">
                      <Car className="w-3.5 h-3.5 text-slate-400" />
                      <span>{route.vehicle || "A pé"}</span>
                    </div>
                  </td>

                  {/* Coords */}
                  <td className="py-3 px-4 font-mono text-slate-500">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1 font-bold text-slate-700">
                        <MapPin className="w-3 h-3 text-cyan-600" />
                        GPS Ativo
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">{route.latlong}</span>
                    </div>
                  </td>

                  {/* Observações / Notas */}
                  <td className="py-3 px-4 max-w-xs truncate font-medium text-slate-600" title={route.notes}>
                    {route.notes || <span className="italic text-slate-400 font-normal">Nenhum registro</span>}
                  </td>

                  {/* Actions Column */}
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRouteId(isSelected ? null : route.routeId);
                      }}
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-sm border transition-all cursor-pointer ${
                        isSelected 
                          ? "bg-purple-600 text-white border-transparent"
                          : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          Selecionado
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                           Ver no Mapa
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}

            {sortedRoutes.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400 italic">
                  Nenhum checkpoint de rota encontrado para as seleções de filtro atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Page Size Control Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-150 text-xs">
        {/* Left: Page Size Selector */}
        <div className="flex items-center gap-2 text-slate-500">
          <span>Checkpoints por página:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-250 rounded-lg py-1 px-2.5 text-xs text-slate-700 font-bold focus:outline-none focus:border-cyan-500 cursor-pointer shadow-sm"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
          <span className="text-slate-400 font-mono">
            • Mostrando {sortedRoutes.length === 0 ? 0 : (activePage - 1) * pageSize + 1}-{Math.min(sortedRoutes.length, activePage * pageSize)} de {sortedRoutes.length}
          </span>
        </div>

        {/* Right: Numbered Pagination Buttons */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={activePage === 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed font-medium transition-all"
            >
              Anterior
            </button>
            
            {getPageNumbers().map((pageNum, idx) => {
              if (pageNum === "...") {
                return (
                  <span key={`dots-${idx}`} className="px-2 py-1 text-slate-400 font-mono">
                    ...
                  </span>
                );
              }
              return (
                <button
                  key={`page-${pageNum}`}
                  onClick={() => setCurrentPage(Number(pageNum))}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold font-mono transition-all cursor-pointer ${
                    activePage === pageNum
                      ? "bg-cyan-600 text-white border-transparent"
                      : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={activePage === totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed font-medium transition-all"
            >
              Próximo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
