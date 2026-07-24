import React, { useState } from "react";
import { User as UserType } from "../types";
import { Shield, Lock, User, Eye, EyeOff, AlertCircle } from "lucide-react";
import logoImg from "../logoBeforeSplashScreen.png";

interface LoginScreenProps {
  users: UserType[];
  onLoginSuccess: (login: string) => void;
}

export default function LoginScreen({ users, onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUser = username.trim().toLowerCase();
    
    // Find matching user
    const matchedUser = users.find(u => u.login.toLowerCase() === trimmedUser);

    if (!matchedUser) {
      setError("Usuário não cadastrado no sistema.");
      return;
    }

    if (matchedUser.passw !== password) {
      setError("Senha incorreta. Verifique os dados e tente novamente.");
      return;
    }

    if (matchedUser.license === "Expirada") {
      setError(`Licença de uso expirada para o operador @${matchedUser.login}. Entre em contato com o administrador.`);
      return;
    }

    // Success!
    onLoginSuccess(matchedUser.login);
  };

  return (
    <div id="login-container" className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] text-slate-800 p-4 md:p-8 relative selection:bg-cyan-500/20 selection:text-cyan-800">
      {/* Background Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.01)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex w-20 h-20 bg-white border border-slate-200/80 rounded-3xl items-center justify-center overflow-hidden shadow-lg transform transition-transform hover:scale-105 duration-300">
            <img 
              src={logoImg} 
              alt="Logo PEMD" 
              className="w-full h-full object-contain p-2"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-950">PEMD SP613-Seg</h1>
            <p className="text-sm font-semibold text-cyan-600 mt-0.5 uppercase tracking-wider">Vigia • Conecta • Protege</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">Insira suas credenciais de operador para acessar o painel tático de registro e segurança</p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 shadow-xl space-y-6">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Lock className="w-4 h-4 text-cyan-600" />
            Controle de Acesso
          </h2>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-2.5 text-rose-700 text-xs animate-headShake">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Input */}
            <div className="space-y-1.5">
              <label htmlFor="username-input" className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-wider flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Login
              </label>
              <input
                id="username-input"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Login"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all"
              />
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label htmlFor="password-input" className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-wider flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                Senha
              </label>
              <div className="relative">
                <input
                  id="password-input"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Senha"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-3 pr-10 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-sm py-3 rounded-xl transition-all shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/20 cursor-pointer mt-2"
            >
              Entrar
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-slate-400 font-mono">
          © Aladdinlab 2026 • Todos os direitos reservados • <a href="https://www.aladdinlab.com.br" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-600 transition-colors underline">www.aladdinlab.com.br</a>
        </p>
      </div>
    </div>
  );
}
