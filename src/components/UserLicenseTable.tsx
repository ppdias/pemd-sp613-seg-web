import React, { useState } from "react";
import { User } from "../types";
import { 
  Award, 
  Timer, 
  ShieldAlert, 
  Key, 
  UserCheck, 
  Shield, 
  Users, 
  Video, 
  Mic, 
  MapPin, 
  Edit2, 
  Trash2, 
  LogOut, 
  X, 
  UserPlus, 
  Search, 
  Filter,
  Check,
  ShieldCheck,
  Lock,
  Image,
  FileText
} from "lucide-react";
import logoImg from "../logoBeforeSplashScreen.png";
import { FirebaseSync } from "../lib/db";

interface UserLicenseTableProps {
  users: User[];
  currentUser?: User | null;
}

export function getLicenseInfo(user: User) {
  if (user.licenseTime === "Ilimitada") {
    return {
      progress: 1.0,
      remainingHours: 9999,
      isExpired: false,
      text: "Ilimitada"
    };
  }

  const now = Date.now();
  const lastUpdate = user.licenseTimeUpdate || user.registrationTimestamp || now;
  const elapsed = now - lastUpdate;
  const dayMillis = 24 * 60 * 60 * 1000;

  let duration = dayMillis;
  switch (user.licenseTime) {
    case "Dia":
      duration = dayMillis;
      break;
    case "Semana":
      duration = 7 * dayMillis;
      break;
    case "Mês":
      duration = 30 * dayMillis;
      break;
    case "Ano":
      duration = 365 * dayMillis;
      break;
  }

  const remaining = Math.max(0, duration - elapsed);
  const progress = remaining / duration;
  const remainingHours = Math.ceil(remaining / (60 * 60 * 1000));
  const isExpired = remaining <= 0;

  let text = `${remainingHours}h restantes`;
  if (isExpired) text = "Expirada";
  else if (remainingHours > 24) text = `${Math.floor(remainingHours / 24)}d restantes`;

  return {
    progress: Math.min(1, Math.max(0, progress)),
    remainingHours,
    isExpired: isExpired || user.license === "Expirada",
    text
  };
}

/**
 * Verifica se o visualizador tem permissão para ver o alvo na hierarquia
 */
function isAuthorizedToView(viewer: User, target: User, allUsers: User[]): boolean {
  if (viewer.group === "Super_saiyajin_instinto_superior") return true;
  if (viewer.id === target.id) return true;

  const adminGroups = ["Admin", "Gestor", "Supervisor"];
  if (adminGroups.includes(viewer.group)) {
    return isUnderResponsibility(viewer.login, target, allUsers, new Set());
  }
  return false;
}

/**
 * Lógica Recursiva de Responsabilidade
 */
function isUnderResponsibility(ownerLogin: string, target: User, allUsers: User[], visited: Set<string>): boolean {
  if (target.userOwner === ownerLogin) return true;
  if (visited.has(ownerLogin)) return false;
  visited.add(ownerLogin);

  const subordinates = allUsers.filter(u => u.userOwner === ownerLogin);
  for (const subordinate of subordinates) {
    if (subordinate.id === target.id) return true;
    if (isUnderResponsibility(subordinate.login, target, allUsers, visited)) return true;
  }
  return false;
}

const HIERARCHY_ROLES = [
  "Super_saiyajin_instinto_superior",
  "Admin",
  "Gestor",
  "Supervisor",
  "Monitor",
  "Vigilante"
];

export default function UserLicenseTable({ users, currentUser }: UserLicenseTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("todos");
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isEditingSelf = !!(editingUser && currentUser && editingUser.id === currentUser.id);
  
  // Form States
  const [formName, setFormName] = useState("");
  const [formLogin, setFormLogin] = useState("");
  const [formPassw, setFormPassw] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formGroup, setFormGroup] = useState("Vigilante");
  const [formGender, setFormGender] = useState("masculino");
  
  // Tracking Configurations
  const [formGPS, setFormGPS] = useState(300);
  const [formGPSRadius, setFormGPSRadius] = useState(10000);
  const [formGPSUpdateInsideRadius, setFormGPSUpdateInsideRadius] = useState(60000);
  const [formLocationAndNetworkCheck, setFormLocationAndNetworkCheck] = useState(600000);

  // Funcionalities Permissions ("sim" / "não")
  const [formCanIa, setFormCanIa] = useState("não");
  const [formCanImage, setFormCanImage] = useState("não");
  const [formCanVideo, setFormCanVideo] = useState("não");
  const [formCanAudio, setFormCanAudio] = useState("não");
  const [formCanText, setFormCanText] = useState("não");
  const [formCanQRCode, setFormCanQRCode] = useState("não");
  const [formCanTag, setFormCanTag] = useState("não");
  const [formCanSMS, setFormCanSMS] = useState("não");
  const [formCanWhats, setFormCanWhats] = useState("não");

  // Media Limits
  const [formCanImageNumber, setFormCanImageNumber] = useState(3);
  const [formCanVideoNumber, setFormCanVideoNumber] = useState(1);
  const [formCanAudioNumber, setFormCanAudioNumber] = useState(1);

  // License and status
  const [formLicense, setFormLicense] = useState("Ativa");
  const [formLicenseTime, setFormLicenseTime] = useState("Dia");
  const [formPhoto, setFormPhoto] = useState("");

  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Returns groups that the current user is allowed to assign.
  const getAvailableGroups = () => {
    if (!currentUser) return ["Vigilante"];
    const myIndex = HIERARCHY_ROLES.indexOf(currentUser.group);
    if (myIndex === -1) return ["Vigilante"];
    
    let allowed = HIERARCHY_ROLES;
    if (currentUser.group !== "Super_saiyajin_instinto_superior") {
      allowed = HIERARCHY_ROLES.slice(myIndex + 1);
    }
    
    // If editing, ensure the user's current group is also available in the list so we don't break the UI
    if (editingUser && !allowed.includes(editingUser.group)) {
      allowed = [editingUser.group, ...allowed];
    }
    
    return allowed;
  };

  // Helper to show persistent success/error notification
  const triggerNotification = (message: string, type: "success" | "error") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  // Hierarchy check: who can the currentUser manage?
  const canManageUser = (targetUser: User): boolean => {
    if (!currentUser) return false;
    if (currentUser.id === targetUser.id) return true; // Allowed to edit self-profile
    return isAuthorizedToView(currentUser, targetUser, users);
  };

  const canAddUsers = () => {
    if (!currentUser) return false;
    const allowedRoles = ["Super_saiyajin_instinto_superior", "Admin", "Supervisor", "Gestor"];
    return allowedRoles.includes(currentUser.group);
  };

  const handleOpenAddModal = () => {
    setEditingUser(null);
    setFormName("");
    setFormLogin("");
    setFormPassw("");
    setFormEmail("");
    
    const available = getAvailableGroups();
    setFormGroup(available.includes("Vigilante") ? "Vigilante" : (available[0] || "Vigilante"));
    
    setFormGender("masculino");
    
    // Tracking Configurations (Defaults matching schema)
    setFormGPS(300);
    setFormGPSRadius(10000);
    setFormGPSUpdateInsideRadius(60000);
    setFormLocationAndNetworkCheck(600000);

    // Funcionalities Permissions ("sim" / "não")
    setFormCanIa("não");
    setFormCanImage("não");
    setFormCanVideo("não");
    setFormCanAudio("não");
    setFormCanText("não");
    setFormCanQRCode("não");
    setFormCanTag("não");
    setFormCanSMS("não");
    setFormCanWhats("não");

    // Limits
    setFormCanImageNumber(3);
    setFormCanVideoNumber(1);
    setFormCanAudioNumber(1);

    setFormLicense("Ativa");
    setFormLicenseTime("Dia");
    setFormPhoto("");
    setShowModal(true);
  };

  const handleOpenEditModal = (user: User) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormLogin(user.login);
    setFormPassw(user.passw);
    setFormEmail(user.email || "");
    setFormGroup(user.group);
    setFormGender(user.gender || "masculino");
    
    // Tracking Configurations
    setFormGPS(user.userGPS !== undefined ? user.userGPS : 300);
    setFormGPSRadius(user.userGPSRadius !== undefined ? user.userGPSRadius : 10000);
    setFormGPSUpdateInsideRadius(user.userGPSUpdateInsideRadius !== undefined ? user.userGPSUpdateInsideRadius : 60000);
    setFormLocationAndNetworkCheck(user.userLocationAndNetworkCheck !== undefined ? user.userLocationAndNetworkCheck : 600000);

    // Funcionalities Permissions
    setFormCanIa(user.userCanIa || "não");
    setFormCanVideo(user.userCanVideo || "não");
    setFormCanAudio(user.userCanAudio || "não");
    setFormCanImage(user.userCanImage || "não");
    setFormCanText(user.userCanText || "não");
    setFormCanQRCode(user.userCanQRCode || "não");
    setFormCanTag(user.userCanTag || "não");
    setFormCanSMS(user.userCanSMS || "não");
    setFormCanWhats(user.userCanWhats || "não");

    // Limits
    setFormCanImageNumber(user.userCanImageNumber !== undefined ? user.userCanImageNumber : 3);
    setFormCanVideoNumber(user.userCanVideoNumber !== undefined ? user.userCanVideoNumber : 1);
    setFormCanAudioNumber(user.userCanAudioNumber !== undefined ? user.userCanAudioNumber : 1);

    setFormLicense(user.license || "Ativa");
    setFormLicenseTime(user.licenseTime || "Dia");
    setFormPhoto(user.photo || "");
    setShowModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    if (!formName.trim() || !formLogin.trim() || !formPassw.trim()) {
      triggerNotification("Preencha todos os campos obrigatórios (*)", "error");
      return;
    }

    // Login validation
    if (formLogin.includes(" ")) {
      triggerNotification("O login do usuário não pode conter espaços", "error");
      return;
    }

    setIsSaving(true);
    try {
      const isNew = !editingUser;
      const targetId = editingUser ? editingUser.id : "user_" + Math.random().toString(36).substr(2, 9);
      
      const updatedUser: User = {
        ...(editingUser || {}),
        id: targetId,
        name: formName.trim(),
        login: formLogin.trim().toLowerCase(),
        passw: formPassw.trim(),
        email: formEmail.trim(),
        group: formGroup,
        gender: formGender,
        userGPS: Number(formGPS),
        userGPSRadius: Number(formGPSRadius),
        userGPSUpdateInsideRadius: Number(formGPSUpdateInsideRadius),
        userLocationAndNetworkCheck: Number(formLocationAndNetworkCheck),
        
        userCanIa: formCanIa,
        userCanVideo: formCanVideo,
        userCanAudio: formCanAudio,
        userCanImage: formCanImage,
        userCanText: formCanText,
        userCanQRCode: formCanQRCode,
        userCanTag: formCanTag,
        userCanSMS: formCanSMS,
        userCanWhats: formCanWhats,

        userCanImageNumber: Number(formCanImageNumber),
        userCanVideoNumber: Number(formCanVideoNumber),
        userCanAudioNumber: Number(formCanAudioNumber),

        license: formLicense,
        licenseTime: formLicenseTime,
        licenseTimeUpdate: editingUser && editingUser.licenseTime === formLicenseTime 
          ? editingUser.licenseTimeUpdate 
          : Date.now(),
        registrationTimestamp: editingUser ? editingUser.registrationTimestamp : Date.now(),
        lastUpdate: Date.now(),
        photo: formPhoto.trim(),
        userOwner: editingUser ? editingUser.userOwner : currentUser.login,
        activeSessionId: editingUser ? editingUser.activeSessionId : "",
        activeMachineId: editingUser ? editingUser.activeMachineId : "",
        
        // Android compatibility defaults
        userCompany: editingUser?.userCompany || "",
        supervisor: editingUser?.supervisor || "Gestor",
        needsProfileUpdate: editingUser?.needsProfileUpdate !== undefined ? editingUser.needsProfileUpdate : true,
        userCanTest: editingUser?.userCanTest || "não",
        storageLocation: editingUser?.storageLocation || "Interno",
        digitalList: editingUser?.digitalList || [],
        workDayStart: editingUser?.workDayStart || "",
        workDayEnd: editingUser?.workDayEnd || ""
      };

      await FirebaseSync.saveUser(updatedUser, currentUser);
      triggerNotification(
        isNew 
          ? `Usuário @${updatedUser.login} cadastrado com sucesso!` 
          : `Cadastro de @${updatedUser.login} atualizado com sucesso!`, 
        "success"
      );
      setShowModal(false);
    } catch (err: any) {
      triggerNotification(`Erro ao salvar usuário: ${err.message || err}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string, login: string) => {
    if (!currentUser) return;
    if (!window.confirm(`Tem certeza que deseja remover o usuário @${login}? Esta operação é irreversível.`)) {
      return;
    }

    try {
      await FirebaseSync.deleteUser(userId, currentUser);
      triggerNotification(`Usuário @${login} foi removido com sucesso do sistema.`, "success");
    } catch (err: any) {
      triggerNotification(`Erro ao deletar usuário: ${err.message || err}`, "error");
    }
  };

  const handleForceLogout = async (userId: string, login: string) => {
    if (!currentUser) return;
    if (!window.confirm(`Deseja encerrar a sessão ativa do usuário @${login} no app Android imediatamente?`)) {
      return;
    }

    try {
      await FirebaseSync.forceLogout(userId, currentUser);
      triggerNotification(`Sessão do usuário @${login} encerrada com sucesso!`, "success");
    } catch (err: any) {
      triggerNotification(`Erro ao forçar logout: ${err.message || err}`, "error");
    }
  };

  // Filter list using hierarchical verification (recursive ownership)
  const filteredUsers = users.filter((u) => {
    // 1. Hierarchical visibility check
    if (currentUser && !isAuthorizedToView(currentUser, u, users)) {
      return false;
    }

    // 2. Text Search Match
    const matchesSearch = 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.login.toLowerCase().includes(searchTerm.toLowerCase());
    
    // 3. Role/Group Filter Match
    const matchesRole = roleFilter === "todos" || u.group === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-lg h-full flex flex-col relative" id="user-license-section">
      {/* Toast Notification */}
      {notification && (
        <div className={`absolute top-4 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border shadow-xl animate-bounce text-sm font-semibold ${
          notification.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-rose-50 border-rose-200 text-rose-800"
        }`}>
          {notification.type === "success" ? <ShieldCheck className="w-5 h-5 text-emerald-600" /> : <ShieldAlert className="w-5 h-5 text-rose-600" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-5 gap-4">
        <div className="flex items-center gap-2.5">
          <div className="bg-cyan-50 p-2.5 rounded-xl border border-cyan-100">
            <Users className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Gestão de usuários</h2>
            <p className="text-xs text-slate-500">Controle hierárquico, limites operacionais GPS e ativação de módulos</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {canAddUsers() && (
            <button
              onClick={handleOpenAddModal}
              className="bg-slate-900 hover:bg-slate-800 border border-transparent text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition-all shadow-md hover:shadow-lg cursor-pointer"
              id="add-user-btn"
            >
              <UserPlus className="w-4 h-4" />
              Novo Usuário
            </button>
          )}
          <span className="bg-slate-100 text-slate-600 text-xs font-mono px-3 py-1.5 rounded-full border border-slate-200">
            Ativos: {filteredUsers.length} / {users.length}
          </span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
        <div className="relative flex-grow">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por nome ou login..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2 min-w-[160px]">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 focus:outline-none focus:border-cyan-500 font-sans"
          >
            <option value="todos">Todos os Grupos</option>
            <option value="Vigilante">Vigilantes</option>
            <option value="Monitor">Monitores</option>
            <option value="Supervisor">Supervisores</option>
            <option value="Gestor">Gestores</option>
            <option value="Admin">Admins</option>
            {currentUser?.group === "Super_saiyajin_instinto_superior" && (
              <option value="Super_saiyajin_instinto_superior">SSJ Instinto Superior</option>
            )}
          </select>
        </div>
      </div>

      {/* Responsive Table Wrapper */}
      <div className="overflow-x-auto flex-grow custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase font-mono tracking-wider">
              <th className="py-3 px-4">Operador</th>
              <th className="py-3 px-4">Supervisor</th>
              <th className="py-3 px-4">GPS (intervalo)</th>
              <th className="py-3 px-4">Módulos</th>
              <th className="py-3 px-4 w-[200px]">Licença</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 font-semibold italic">
                  Nenhum usuário localizado com as especificações atuais.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const license = getLicenseInfo(user);
                const isExpired = license.isExpired;
                const activeSession = user.activeSessionId && user.activeSessionId.trim() !== "";
                const isManageable = canManageUser(user);

                // Progress colors
                let progressColor = "bg-emerald-500";
                if (license.progress < 0.2) progressColor = "bg-rose-500 animate-pulse";
                else if (license.progress < 0.5) progressColor = "bg-amber-500";

                return (
                  <tr key={user.id} className="hover:bg-slate-50/40 transition-colors">
                    {/* Name / Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <img
                            src={user.photo || logoImg}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-sm"
                            alt={user.name}
                            referrerPolicy="no-referrer"
                          />
                          <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                            activeSession ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                          }`} title={activeSession ? "Conectado no Android" : "Desconectado"} />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            {user.name}
                            {activeSession && (
                              <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded-full font-mono uppercase">
                                Online
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-mono flex items-center gap-1">
                            <span>@{user.login}</span>
                            <span className="text-slate-300">•</span>
                            <span>Senha: {"*".repeat(user.passw?.length || 6)}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Hierarchy */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono border self-start ${
                          user.group === "Super_saiyajin_instinto_superior"
                            ? "bg-amber-50 text-amber-700 border-amber-200 font-bold"
                            : user.group === "Admin"
                            ? "bg-purple-50 text-purple-700 border-purple-200 font-bold"
                            : user.group === "Supervisor" || user.group === "Gestor"
                            ? "bg-rose-50 text-rose-700 border-rose-200 font-semibold"
                            : "bg-cyan-50 text-cyan-700 border-cyan-200"
                        }`}>
                          {user.group === "Super_saiyajin_instinto_superior" ? <Award className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                          {user.group}
                        </span>
                        {user.group === "Admin" || user.group === "Gestor" ? null : user.userOwner ? (
                          <span className="text-[10px] text-slate-500 font-medium pl-1">
                            Supervisão: <strong className="text-slate-700">@{user.userOwner}</strong>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic pl-1">
                            Acesso Global / Autônomo
                          </span>
                        )}
                      </div>
                    </td>

                    {/* GPS configs */}
                    <td className="py-3.5 px-4 font-mono text-xs">
                      <div className="flex flex-col text-slate-600 gap-0.5">
                        <span className="flex items-center gap-1">
                          <Timer className="w-3.5 h-3.5 text-slate-400" />
                          Intervalo: <strong className="text-slate-800">{user.userGPS || 120}s</strong>
                        </span>
                      </div>
                    </td>

                    {/* Active Modules Matrix */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1.5 max-w-[220px]">
                        {user.userCanImage !== "não" && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold font-mono border bg-amber-50 text-amber-700 border-amber-200" title="Transmissão de Imagem Permitida">
                            <Image className="w-3 h-3" /> Imagem
                          </span>
                        )}

                        {user.userCanVideo === "sim" && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold font-mono border bg-cyan-50 text-cyan-700 border-cyan-200" title="Transmissão de Vídeo Permitida">
                            <Video className="w-3 h-3" /> Vídeo
                          </span>
                        )}

                        {user.userCanAudio === "sim" && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold font-mono border bg-indigo-50 text-indigo-700 border-indigo-200" title="Gravação de Áudio Permitida">
                            <Mic className="w-3 h-3" /> Áudio
                          </span>
                        )}

                        {user.userCanText !== "não" && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold font-mono border bg-orange-50 text-orange-700 border-orange-200" title="Transmissão de Texto Permitida">
                            <FileText className="w-3 h-3" /> Texto
                          </span>
                        )}

                        {user.userCanIa === "sim" && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold font-mono border bg-emerald-50 text-emerald-700 border-emerald-200" title="Processamento de IA Permitido">
                            <UserCheck className="w-3.5 h-3.5" /> IA
                          </span>
                        )}

                        {user.userCanImage === "não" && user.userCanVideo !== "sim" && user.userCanAudio !== "sim" && user.userCanText === "não" && user.userCanIa !== "sim" && (
                          <span className="text-xs text-slate-400 italic">Nenhum</span>
                        )}
                      </div>
                    </td>

                    {/* License validity */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs font-semibold font-mono">
                          <span className="flex items-center gap-1 text-slate-500 text-[10px]">
                            <Timer className="w-3 h-3 text-slate-400" />
                            {user.licenseTime}
                          </span>
                          <span className={isExpired ? "text-rose-500 font-bold animate-pulse" : "text-slate-800 text-[11px]"}>
                            {license.text}
                          </span>
                        </div>
                        
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${progressColor}`}
                            style={{ width: `${license.progress * 100}%` }}
                          />
                        </div>

                        {isExpired && (
                          <div className="flex items-center gap-1 text-[9px] text-rose-500 font-bold uppercase tracking-wider mt-0.5">
                            <ShieldAlert className="w-2.5 h-2.5" /> Acesso Suspenso
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Action buttons */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Edit User Button */}
                        <button
                          onClick={() => handleOpenEditModal(user)}
                          disabled={!isManageable}
                          title={isManageable ? "Editar cadastro e licença" : "Sem permissão de gerenciamento"}
                          className={`p-2 rounded-lg border transition-all cursor-pointer ${
                            isManageable 
                              ? "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 hover:border-slate-300"
                              : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                          }`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Force Logout Button */}
                        <button
                          onClick={() => handleForceLogout(user.id, user.login)}
                          disabled={!isManageable || currentUser?.id === user.id || !activeSession || !(currentUser?.group === "Admin" || currentUser?.group === "Super_saiyajin_instinto_superior")}
                          title={
                            currentUser?.id === user.id
                              ? "Não é possível derrubar a própria sessão"
                              : !isManageable 
                              ? "Sem permissão"
                              : !activeSession 
                              ? "Sem sessão ativa no app Android"
                              : !(currentUser?.group === "Admin" || currentUser?.group === "Super_saiyajin_instinto_superior")
                              ? "Apenas administradores podem derrubar sessões"
                              : "Encerrar sessão no Android forçadamente"
                          }
                          className={`p-2 rounded-lg border transition-all cursor-pointer ${
                            isManageable && currentUser?.id !== user.id && activeSession && (currentUser?.group === "Admin" || currentUser?.group === "Super_saiyajin_instinto_superior")
                              ? "bg-purple-50 hover:bg-purple-100 text-purple-600 border-purple-200 hover:border-purple-300"
                              : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                          }`}
                        >
                          <LogOut className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete User Button */}
                        <button
                          onClick={() => handleDeleteUser(user.id, user.login)}
                          disabled={!isManageable || currentUser?.id === user.id}
                          title={
                            currentUser?.id === user.id
                              ? "Não é possível remover a si próprio"
                              : isManageable 
                              ? "Remover permanentemente" 
                              : "Sem permissão de exclusão"
                          }
                          className={`p-2 rounded-lg border transition-all cursor-pointer ${
                            isManageable && currentUser?.id !== user.id
                              ? "bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200 hover:border-rose-300"
                              : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modern High-fidelity Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className={`bg-white border border-slate-200 rounded-3xl w-full ${isEditingSelf ? "max-w-md" : "max-w-2xl"} p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden`}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-600" />
                {isEditingSelf ? "Editar Meu Perfil" : editingUser ? `Editar Usuário: @${editingUser.login}` : "Cadastrar Novo Operador no Sistema"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-800 text-xl font-bold font-mono cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveUser} className="space-y-4 flex-grow overflow-y-auto pr-1 custom-scrollbar">
              <div className={`grid grid-cols-1 ${isEditingSelf ? "" : "md:grid-cols-2"} gap-4`}>
                
                {/* Identification block */}
                <div className="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-500">1. Identificação Geral</h4>
                  
                  {/* Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Ex: Carlos Silva"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* Login */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Login (Sem Espaços) *</label>
                    <input
                      type="text"
                      required
                      disabled={!!editingUser}
                      value={formLogin}
                      onChange={(e) => setFormLogin(e.target.value)}
                      placeholder="Ex: csilva"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  {/* Password */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Senha de Acesso *</label>
                    <input
                      type="text"
                      required
                      value={formPassw}
                      onChange={(e) => setFormPassw(e.target.value)}
                      placeholder="Ex: senha123"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* Gender */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Gênero</label>
                      <select
                        value={formGender}
                        onChange={(e) => setFormGender(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="masculino">Masculino</option>
                        <option value="feminino">Feminino</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Hierarquia / Grupo</label>
                      <select
                        value={formGroup}
                        onChange={(e) => setFormGroup(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                      >
                        {getAvailableGroups().map((role) => (
                          <option key={role} value={role}>
                            {role === "Super_saiyajin_instinto_superior" ? "SSJ Instinto Superior" : role}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">E-mail</label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="Ex: operador@empresa.com"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* Photo URL */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">URL da Foto do Operador</label>
                    <input
                      type="text"
                      value={formPhoto}
                      onChange={(e) => setFormPhoto(e.target.value)}
                      placeholder="Deixe em branco para usar avatar padrão"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* Operation & permissions & licenses */}
                {!isEditingSelf && (
                  <div className="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-500">2. Parâmetros & Licenciamento</h4>

                    {/* ALWAYS VISIBLE & EDITABLE: Intervalo GPS (s) */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Intervalo GPS (s)</label>
                      <input
                        type="number"
                        min="10"
                        max="3600"
                        value={formGPS}
                        onChange={(e) => setFormGPS(Number(e.target.value))}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    {currentUser?.group === "Super_saiyajin_instinto_superior" && (
                      <>
                        {/* Remaining GPS and precision params for SSJ */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Precisão Raio (m)</label>
                            <input
                              type="number"
                              min="2"
                              max="20000"
                              value={formGPSRadius}
                              onChange={(e) => setFormGPSRadius(Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">GPS Dentro do Raio (ms)</label>
                            <input
                              type="number"
                              min="1000"
                              step="1000"
                              value={formGPSUpdateInsideRadius}
                              onChange={(e) => setFormGPSUpdateInsideRadius(Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Checagem Rede/Loc (ms)</label>
                            <input
                              type="number"
                              min="5000"
                              step="1000"
                              value={formLocationAndNetworkCheck}
                              onChange={(e) => setFormLocationAndNetworkCheck(Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* License parameters */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Status da Licença</label>
                        <select
                          value={formLicense}
                          onChange={(e) => setFormLicense(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                        >
                          <option value="Ativa">Ativa (Habilitado)</option>
                          <option value="Expirada">Expirada (Suspenso)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Validade / Duração</label>
                        <select
                          value={formLicenseTime}
                          onChange={(e) => setFormLicenseTime(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                        >
                          <option value="Ilimitada">Ilimitada</option>
                          <option value="Dia">1 Dia (24h)</option>
                          <option value="Semana">1 Semana (7d)</option>
                          <option value="Mês">1 Mês (30d)</option>
                          <option value="Ano">1 Ano (365d)</option>
                        </select>
                      </div>
                    </div>

                    {/* Info Warning */}
                    <div className="bg-amber-50 border border-amber-150 p-2.5 rounded-xl text-[10px] text-amber-800 leading-relaxed">
                      <strong>Aviso operacional:</strong> Alterações de validade redefinem o relógio regressivo de expiração de licença imediatamente. Usuários suspensos não conseguem sincronizar rotas nem emitir alertas pelo aplicativo Android.
                    </div>
                  </div>
                )}

                {/* Permissions & Limits block */}
                {!isEditingSelf && currentUser?.group !== "Supervisor" && (
                  <div className="col-span-1 md:col-span-2 space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-500">3. Permissões de Funcionalidades & Limites de Mídia</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Column 3.1: Media and limits */}
                      <div className="space-y-3 bg-white p-3 rounded-xl border border-slate-200/60">
                        <h5 className="text-[10px] font-bold font-mono text-cyan-600 uppercase tracking-wider">Mídias Principais</h5>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs text-slate-700 font-semibold">Permitir Imagem</label>
                            <select
                              value={formCanImage}
                              onChange={(e) => setFormCanImage(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                            >
                              <option value="sim">Sim</option>
                              <option value="não">Não</option>
                            </select>
                          </div>
                          {formCanImage === "sim" && (
                            <div className="flex items-center justify-between pl-3 border-l-2 border-amber-300">
                              <span className="text-[10px] text-slate-500 font-mono">Limite Imagens:</span>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={formCanImageNumber}
                                onChange={(e) => setFormCanImageNumber(Number(e.target.value))}
                                className="w-16 bg-slate-50 border border-slate-200 rounded-lg py-0.5 px-1.5 text-xs text-center text-slate-800"
                              />
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs text-slate-700 font-semibold">Permitir Vídeo</label>
                            <select
                              value={formCanVideo}
                              onChange={(e) => setFormCanVideo(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                            >
                              <option value="sim">Sim</option>
                              <option value="não">Não</option>
                            </select>
                          </div>
                          {formCanVideo === "sim" && (
                            <div className="flex items-center justify-between pl-3 border-l-2 border-cyan-300">
                              <span className="text-[10px] text-slate-500 font-mono">Limite Vídeos:</span>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={formCanVideoNumber}
                                onChange={(e) => setFormCanVideoNumber(Number(e.target.value))}
                                className="w-16 bg-slate-50 border border-slate-200 rounded-lg py-0.5 px-1.5 text-xs text-center text-slate-800"
                              />
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs text-slate-700 font-semibold">Permitir Áudio</label>
                            <select
                              value={formCanAudio}
                              onChange={(e) => setFormCanAudio(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                            >
                              <option value="sim">Sim</option>
                              <option value="não">Não</option>
                            </select>
                          </div>
                          {formCanAudio === "sim" && (
                            <div className="flex items-center justify-between pl-3 border-l-2 border-indigo-300">
                              <span className="text-[10px] text-slate-500 font-mono">Limite Áudios:</span>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={formCanAudioNumber}
                                onChange={(e) => setFormCanAudioNumber(Number(e.target.value))}
                                className="w-16 bg-slate-50 border border-slate-200 rounded-lg py-0.5 px-1.5 text-xs text-center text-slate-800"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Column 3.2: Operations modules */}
                      <div className="space-y-3 bg-white p-3 rounded-xl border border-slate-200/60">
                        <h5 className="text-[10px] font-bold font-mono text-cyan-600 uppercase tracking-wider">Módulos Extras</h5>
                        
                        {currentUser?.group === "Super_saiyajin_instinto_superior" && (
                          <div className="flex items-center justify-between">
                            <label className="text-xs text-slate-700 font-semibold">Permitir IA</label>
                            <select
                              value={formCanIa}
                              onChange={(e) => setFormCanIa(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                            >
                              <option value="sim">Sim</option>
                              <option value="não">Não</option>
                            </select>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <label className="text-xs text-slate-700 font-semibold">Permitir Texto</label>
                          <select
                            value={formCanText}
                            onChange={(e) => setFormCanText(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                          >
                            <option value="sim">Sim</option>
                            <option value="não">Não</option>
                          </select>
                        </div>

                        <div className="flex items-center justify-between">
                          <label className="text-xs text-slate-700 font-semibold">Permitir QR Code</label>
                          <select
                            value={formCanQRCode}
                            onChange={(e) => setFormCanQRCode(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                          >
                            <option value="sim">Sim</option>
                            <option value="não">Não</option>
                          </select>
                        </div>
                      </div>

                      {/* Column 3.3: Integrations */}
                      <div className="space-y-3 bg-white p-3 rounded-xl border border-slate-200/60">
                        <h5 className="text-[10px] font-bold font-mono text-cyan-600 uppercase tracking-wider">Integrações & Tags</h5>
                        
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-slate-700 font-semibold">Permitir Tag / NFC</label>
                          <select
                            value={formCanTag}
                            onChange={(e) => setFormCanTag(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                          >
                            <option value="sim">Sim</option>
                            <option value="não">Não</option>
                          </select>
                        </div>

                        {currentUser?.group === "Super_saiyajin_instinto_superior" && (
                          <>
                            <div className="flex items-center justify-between">
                              <label className="text-xs text-slate-700 font-semibold">Permitir SMS</label>
                              <select
                                value={formCanSMS}
                                onChange={(e) => setFormCanSMS(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                              >
                                <option value="sim">Sim</option>
                                <option value="não">Não</option>
                              </select>
                            </div>

                            <div className="flex items-center justify-between">
                              <label className="text-xs text-slate-700 font-semibold">Permitir WhatsApp</label>
                              <select
                                value={formCanWhats}
                                onChange={(e) => setFormCanWhats(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none focus:border-cyan-500"
                              >
                                <option value="sim">Sim</option>
                                <option value="não">Não</option>
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 px-5 rounded-xl transition-all cursor-pointer border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold py-2.5 px-6 rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving ? "Gravando..." : editingUser ? "Salvar Alterações" : "Gravar Novo Usuário"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
