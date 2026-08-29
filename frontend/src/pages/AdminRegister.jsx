import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, Loader2, CheckCircle2, Upload } from "lucide-react";
import { adminRegister } from "@/lib/api";

export default function AdminRegister() {
  const navigate = useNavigate();
  const [f, setF] = useState({ full_name: "", email: "", password: "", designation: "", department: "", state: "", district: "", ward: "", official_id: "" });
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      if (proof) fd.append("proof", proof);
      await adminRegister(fd);
      setDone(true);
    } catch (e) { setErr(e.response?.data?.detail || "Could not submit request"); }
    finally { setBusy(false); }
  };

  const req = f.full_name && f.email && f.password && f.designation && f.department && f.state;

  if (done) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0f1417] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[#243036] bg-[#151c21] p-8 text-center text-white">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#123]"><CheckCircle2 className="h-9 w-9 text-[#4e9e74]" /></span>
          <h1 className="mt-4 font-heading text-xl font-extrabold">Request submitted</h1>
          <p className="mt-2 text-sm text-[#8aa0a8]">Your admin access request is pending super-admin approval. You'll be able to sign in once approved.</p>
          <button data-testid="admin-register-done-btn" onClick={() => navigate("/admin-login")} className="mt-6 w-full rounded-xl bg-[#1f7a72] py-3 text-sm font-semibold">Back to login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0f1417] px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-[#243036] bg-[#151c21] p-8 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1f7a72]"><ShieldCheck className="h-6 w-6" /></span>
          <div><h1 className="font-heading text-xl font-extrabold">Request admin access</h1><p className="text-xs text-[#8aa0a8]">Verified municipal staff only</p></div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full name" testid="reg-full-name" value={f.full_name} onChange={upd("full_name")} />
          <Field label="Official email" testid="reg-email" type="email" value={f.email} onChange={upd("email")} />
          <Field label="Password (min 8)" testid="reg-password" type="password" value={f.password} onChange={upd("password")} />
          <Field label="Official ID no." testid="reg-official-id" value={f.official_id} onChange={upd("official_id")} />
          <Field label="Designation" testid="reg-designation" value={f.designation} onChange={upd("designation")} />
          <Field label="Department" testid="reg-department" value={f.department} onChange={upd("department")} />
          <Field label="State (jurisdiction)" testid="reg-state" value={f.state} onChange={upd("state")} placeholder="e.g. Haryana" />
          <Field label="District" testid="reg-district" value={f.district} onChange={upd("district")} placeholder="e.g. Gurugram" />
          <Field label="Ward (optional)" testid="reg-ward" value={f.ward} onChange={upd("ward")} />
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#8aa0a8]">Proof of authorization</label>
            <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#2b3940] bg-[#0f1417] px-4 py-3 text-sm text-[#8aa0a8]">
              <Upload className="h-4 w-4" /> {proof ? proof.name : "Upload ID / dept. document"}
              <input data-testid="reg-proof" type="file" className="hidden" onChange={(e) => setProof(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>

        {err && <p data-testid="admin-register-error" className="mt-3 text-sm text-red-400">{err}</p>}
        <button data-testid="admin-register-submit" onClick={submit} disabled={busy || !req} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1f7a72] py-3.5 text-sm font-semibold disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Submit request
        </button>
        <p className="pt-3 text-center text-xs text-[#8aa0a8]">Already approved? <Link to="/admin-login" className="font-semibold text-[#5fd0c5]">Sign in</Link></p>
      </div>
    </div>
  );
}

function Field({ label, testid, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wider text-[#8aa0a8]">{label}</label>
      <input data-testid={testid} type={type} value={value} onChange={onChange} placeholder={placeholder} className="mt-1 w-full rounded-xl border border-[#2b3940] bg-[#0f1417] px-4 py-3 text-sm outline-none focus:border-[#1f7a72]" />
    </div>
  );
}
