import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, Loader2, KeyRound, Copy } from "lucide-react";
import { toast } from "sonner";
import { adminLogin, admin2fa } from "@/lib/api";
import { useAdminAuth } from "@/context/AdminAuthContext";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { setAdmin } = useAdminAuth();
  const [stage, setStage] = useState("login"); // login | setup | verify
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [temp, setTemp] = useState("");
  const [otpUri, setOtpUri] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const doLogin = async () => {
    setErr(""); setBusy(true);
    try {
      const res = await adminLogin(email.trim(), password);
      setTemp(res.temp_token);
      if (res.stage === "setup") { setSecret(res.secret); setOtpUri(res.otpauth_uri); setStage("setup"); }
      else setStage("verify");
    } catch (e) { setErr(e.response?.data?.detail || "Login failed"); }
    finally { setBusy(false); }
  };

  const doVerify = async () => {
    setErr(""); setBusy(true);
    try {
      const res = await admin2fa(temp, code.trim());
      setAdmin(res.admin);
      toast.success("Welcome to the admin portal");
      navigate("/admin");
    } catch (e) { setErr(e.response?.data?.detail || "Invalid code"); }
    finally { setBusy(false); }
  };

  const qrSrc = otpUri ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(otpUri)}` : null;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0f1417] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#243036] bg-[#151c21] p-8 text-white shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1f7a72]"><ShieldCheck className="h-6 w-6" /></span>
          <div>
            <h1 className="font-heading text-xl font-extrabold">Fix My Area — Admin Portal</h1>
            <p className="text-xs text-[#8aa0a8]">Restricted municipal access</p>
          </div>
        </div>

        {stage === "login" && (
          <div className="mt-6 space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-[#8aa0a8]">Official email</label>
            <input data-testid="admin-email-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@municipality.gov.in" className="w-full rounded-xl border border-[#2b3940] bg-[#0f1417] px-4 py-3 text-sm outline-none focus:border-[#1f7a72]" />
            <label className="text-xs font-bold uppercase tracking-wider text-[#8aa0a8]">Password</label>
            <input data-testid="admin-password-input" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} type="password" placeholder="••••••••" className="w-full rounded-xl border border-[#2b3940] bg-[#0f1417] px-4 py-3 text-sm outline-none focus:border-[#1f7a72]" />
            {err && <p data-testid="admin-login-error" className="text-sm text-red-400">{err}</p>}
            <button data-testid="admin-login-btn" onClick={doLogin} disabled={busy || !email || !password} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1f7a72] py-3.5 text-sm font-semibold disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Continue
            </button>
            <p className="pt-2 text-center text-xs text-[#8aa0a8]">Need an account? <Link to="/admin-register" data-testid="admin-register-link" className="font-semibold text-[#5fd0c5]">Request admin access</Link></p>
          </div>
        )}

        {(stage === "setup" || stage === "verify") && (
          <div className="mt-6 space-y-3">
            {stage === "setup" && (
              <div className="rounded-xl border border-[#2b3940] bg-[#0f1417] p-4">
                <p className="text-sm font-semibold">Set up two-factor authentication</p>
                <p className="mt-1 text-xs text-[#8aa0a8]">Scan this QR in Google Authenticator / Authy, then enter the 6-digit code.</p>
                {qrSrc && <img src={qrSrc} alt="2FA QR" className="mx-auto mt-3 h-40 w-40 rounded-lg bg-white p-1" />}
                <button onClick={() => { navigator.clipboard.writeText(secret); toast.success("Secret copied"); }} className="mx-auto mt-2 flex items-center gap-1.5 text-xs font-mono text-[#5fd0c5]"><Copy className="h-3.5 w-3.5" /> {secret}</button>
              </div>
            )}
            {stage === "verify" && <p className="text-sm text-[#8aa0a8]">Enter the 6-digit code from your authenticator app.</p>}
            <input data-testid="admin-2fa-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} placeholder="••••••" className="w-full rounded-xl border border-[#2b3940] bg-[#0f1417] px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] outline-none focus:border-[#1f7a72]" />
            {err && <p data-testid="admin-2fa-error" className="text-sm text-red-400">{err}</p>}
            <button data-testid="admin-2fa-btn" onClick={doVerify} disabled={busy || code.length < 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1f7a72] py-3.5 text-sm font-semibold disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify & sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
