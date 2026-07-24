import React, { useState } from "react";
import { LogEntry } from "../types";
import { FileSpreadsheet, FileText, Search, Filter, History, Clock, Monitor, Database } from "lucide-react";

interface LogsHistoryProps {
  logs: LogEntry[];
}

export default function LogsHistory({ logs }: LogsHistoryProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [eventFilter, setEventFilter] = useState<string>("todos");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Filter logs based on search query and eventType
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.ipAddress && log.ipAddress.includes(searchQuery)) ||
      log.userGroup.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesEvent = eventFilter === "todos" || log.eventType === eventFilter;

    return matchesSearch && matchesEvent;
  });

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, eventFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const activePage = Math.min(currentPage, totalPages);
  const paginatedLogs = filteredLogs.slice((activePage - 1) * pageSize, activePage * pageSize);

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

  // Unique event types for filter select
  const uniqueEventTypes = Array.from(new Set(logs.map((l) => l.eventType).filter(Boolean)));

  /**
   * Generates a fully formatted CSV to be opened in Microsoft Excel/Google Sheets
   */
  const exportToCSV = () => {
    if (filteredLogs.length === 0) return;

    // Excel CSV Headers
    const headers = ["ID", "Usuario", "Grupo", "Tipo de Evento", "Descricao", "Data", "Hora", "IP Address", "Geolocalizacao", "Dispositivo"];
    
    // Format rows
    const rows = filteredLogs.map((log) => [
      log.id,
      log.userName,
      log.userGroup,
      log.eventType,
      `"${log.description.replace(/"/g, '""')}"`, // escape quotes for security
      log.date,
      log.hour,
      log.ipAddress || "Off line",
      log.latlong,
      log.machineId || "Browser_Web"
    ]);

    // Build file
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `PEMD_SP613_AuditLogs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /**
   * Formats the filtered logs table cleanly and launches the standard browser print dialogue
   * configured with CSS for clean PDF export.
   */
  const exportToPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const htmlContent = `
      <html>
        <head>
          <title>Relatório de Auditoria e Logs - PEMD SP613-Seg</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; padding: 20px; }
            h1 { font-size: 20px; font-weight: bold; margin-bottom: 5px; color: #0f172a; text-transform: uppercase; border-bottom: 2px solid #0284c7; padding-bottom: 10px; }
            h3 { font-size: 12px; font-weight: normal; margin-top: 0; color: #64748b; font-family: monospace; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
            th { background-color: #f1f5f9; color: #475569; font-weight: bold; text-align: left; padding: 8px; border: 1px solid #cbd5e1; text-transform: uppercase; font-family: monospace; }
            td { padding: 8px; border: 1px solid #e2e8f0; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .footer { margin-top: 30px; font-size: 10px; text-align: center; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>PEMD SP613-Seg - Central de Comando</h1>
          <h3>RELATÓRIO DE AUDITORIA DE SEGURANÇA E LOGS • EMITIDO EM ${new Date().toLocaleString("pt-BR")}</h3>
          <table>
            <thead>
              <tr>
                <th>Data / Hora</th>
                <th>Operador / Vigilante</th>
                <th>Grupo</th>
                <th>Evento</th>
                <th>Descrição do Log</th>
                <th>IP / Dispositivo</th>
              </tr>
            </thead>
            <tbody>
              ${filteredLogs.map(log => `
                <tr>
                  <td>${log.date} ${log.hour}</td>
                  <td><b>${log.userName}</b></td>
                  <td>${log.userGroup}</td>
                  <td><span style="font-family: monospace; font-weight: bold; color: #0284c7;">${log.eventType.toUpperCase()}</span></td>
                  <td>${log.description}</td>
                  <td>${log.ipAddress || "Offline"} / ${log.machineId || "Web"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <div class="footer">
            PEMD SP613-Seg • Central de Comando Híbrida Web • Sistema de Segurança e Monitoramento Robustecido
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-lg h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-cyan-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Histórico de Atividades e Logs</h2>
            <p className="text-xs text-slate-500">Coleção auditada de eventos registrados</p>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={exportToCSV}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 disabled:bg-transparent border border-emerald-200 text-emerald-700 text-xs px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel (CSV)
          </button>
          <button
            onClick={exportToPDF}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 disabled:opacity-50 disabled:bg-transparent border border-sky-200 text-sky-700 text-xs px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            <FileText className="w-4 h-4" /> Exportar PDF (Imprimir)
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {/* Search Input */}
        <div className="relative md:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por operador, palavra-chave, IP..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:bg-white transition-all font-sans"
          />
        </div>

        {/* Event Selector */}
        <div className="relative">
          <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-700 focus:outline-none focus:border-cyan-500 focus:bg-white transition-all font-sans appearance-none"
          >
            <option value="todos">Todos Eventos</option>
            {uniqueEventTypes.map((type) => (
              <option key={type} value={type}>
                {type.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Table */}
      <div className="overflow-x-auto flex-grow custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase font-mono tracking-wider">
              <th className="py-3 px-4">Timestamp / Horário</th>
              <th className="py-3 px-4">Usuário</th>
              <th className="py-3 px-4">Grupo</th>
              <th className="py-3 px-4">Evento</th>
              <th className="py-3 px-4">Descrição da Atividade</th>
              <th className="py-3 px-4">Terminal / Conexão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {paginatedLogs.map((log) => {
              const isAlert = log.eventType === "alerta" || log.eventType === "emergência";
              return (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  {/* Date & Time */}
                  <td className="py-3 px-4 font-mono text-slate-500">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800">{log.date}</span>
                      <span className="text-[10px] flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {log.hour}
                      </span>
                    </div>
                  </td>

                  {/* User Login */}
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {log.userName}
                  </td>

                  {/* Group Badge */}
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px] text-slate-600">
                      {log.userGroup}
                    </span>
                  </td>

                  {/* Event Type */}
                  <td className="py-3 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase border ${
                      isAlert
                        ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
                        : log.eventType === "login"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : log.eventType === "logout"
                        ? "bg-slate-100 text-slate-700 border-slate-200"
                        : "bg-cyan-50 text-cyan-700 border-cyan-200"
                    }`}>
                      {log.eventType}
                    </span>
                  </td>

                  {/* Description */}
                  <td className="py-3 px-4 max-w-xs truncate font-medium text-slate-800" title={log.description}>
                    {log.description}
                  </td>

                  {/* Device / Connection */}
                  <td className="py-3 px-4 text-slate-500">
                    <div className="flex flex-col font-mono text-[10px]">
                      <span className="flex items-center gap-1">
                        <Monitor className="w-3 h-3 text-slate-400" />
                        {log.machineId || "Web"}
                      </span>
                      <span className="flex items-center gap-1 mt-0.5">
                        <Database className="w-3 h-3 text-slate-400" />
                        {log.ipAddress || "Off line"}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400 italic">
                  Nenhum registro de log encontrado para os filtros atuais.
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
          <span>Logs por página:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-250 rounded-lg py-1 px-2.5 text-xs text-slate-700 font-bold focus:outline-none focus:border-cyan-500 cursor-pointer shadow-sm animate-fade-in"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
          <span className="text-slate-400 font-mono">
            • Mostrando {filteredLogs.length === 0 ? 0 : (activePage - 1) * pageSize + 1}-{Math.min(filteredLogs.length, activePage * pageSize)} de {filteredLogs.length}
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
                      ? "bg-cyan-600 text-white border-transparent shadow-xs"
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
