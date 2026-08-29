import React, { useState, useEffect } from "react";
import { Drawer } from "vaul";
import { useTranslation } from "react-i18next";
import { Phone, ArrowLeft, X, Loader2, ShieldCheck, MessageSquare, User } from "lucide-react";
import { toast } from "sonner";
import { phoneStart, phoneVerify, setProfile } from "@/lib/api";

export default function PhoneAuth({ open, onOpenChange, onAuthed }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1); // 1 phone, 2 code, 3 name
  const [phone, setPhone] = useState("+91");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [demoCode, setDemoCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pendingUser, setPendingUser] = useState(null);

  useEffect(() => {
    if (open) { setStep(1); setPhone("+91"); setCode(""); setName(""); setDemoCode(null); setErr(""); setBusy(false); setPendingUser(null); }
  }, [open]);

  const start = async (channel = "call") => {
    setErr(""); setBusy(true);
    try {
      const res = await phoneStart(phone.trim(), channel);
      setDemoCode(res.demo ? res.demo_code : null);
      setStep(2);
      if (!res.demo) toast.success(channel === "sms" ? "Code sent via SMS" : "You'll receive a call with your code");
    } catch (e) {
      setErr(e.response?.data?.detail || t("phone.invalidNumber"));
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setErr(""); setBusy(true);
    try {
      const res = await phoneVerify(phone.trim(), code.trim());
      if (res.is_new) { setPendingUser(res.user); setStep(3); }
      else { onAuthed(res.user); }
    } catch (e) {
      setErr(e.response?.data?.detail || t("phone.wrongCode"));
    } finally { setBusy(false); }
  };

  const saveName = async () => {
    setBusy(true);
    try {
      const u = await setProfile(name.trim() || "Anonymous");
      onAuthed(u);
    } catch (e) { onAuthed(pendingUser); }
    finally { setBusy(false); }
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[1400] bg-black/40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[1400] mx-auto flex max-h-[92dvh] max-w-lg flex-col rounded-t-3xl bg-[#f6f5f1] outline-none">
          <Drawer.Title className="sr-only">{t("phone.title")}</Drawer.Title>
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-[#d9d6cd]" />
          <div className="flex items-center justify-between px-6 pt-4">
            <div className="flex items-center gap-2">
              {step === 2 && <button data-testid="phone-back-btn" onClick={() => setStep(1)} className="rounded-full p-1.5 hover:bg-black/5"><ArrowLeft className="h-5 w-5" /></button>}
              <h2 className="font-heading text-2xl font-bold tracking-tight">{t("phone.title")}</h2>
            </div>
            <button data-testid="phone-close-btn" onClick={() => onOpenChange(false)} className="rounded-full p-1.5 hover:bg-black/5"><X className="h-5 w-5" /></button>
          </div>

          <div className="px-6 pb-10 pt-5">
            {step === 1 && (
              <div className="cf-rise">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f2f0]"><Phone className="h-7 w-7 text-[#1f7a72]" /></span>
                <h3 className="mt-4 font-heading text-xl font-bold">{t("phone.enterNumber")}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#6b6b70]">{t("phone.enterNumberSub")}</p>
                <input data-testid="phone-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210"
                  className="fx-input mt-4 w-full px-4 py-4 text-lg font-semibold tracking-wide" />
                {err && <p data-testid="phone-error" className="mt-2 text-sm text-red-600">{err}</p>}
                <button data-testid="phone-send-btn" disabled={busy} onClick={() => start("call")} className="fx-btn fx-btn-primary mt-5 w-full py-4">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Phone className="h-5 w-5" />} {t("phone.callMe")}
                </button>
                <p className="mt-3 text-center text-xs text-[#9a9a9f]">{t("phone.noPassword")}</p>
              </div>
            )}

            {step === 2 && (
              <div className="cf-rise">
                <h3 className="font-heading text-xl font-bold">{t("phone.enterCode")}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#6b6b70]">{t("phone.enterCodeSub", { phone })}</p>
                {demoCode && (
                  <div data-testid="phone-demo-hint" className="mt-3 rounded-xl bg-[#e8f2f0] p-3 text-sm font-semibold text-[#17635c]">
                    {t("phone.demoHint", { code: demoCode })}
                  </div>
                )}
                <input data-testid="phone-code-input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••"
                  className="fx-input mt-4 w-full px-4 py-4 text-center text-2xl font-bold tracking-[0.4em]" />
                {err && <p data-testid="phone-error" className="mt-2 text-sm text-red-600">{err}</p>}
                <button data-testid="phone-verify-btn" disabled={busy || code.length < 4} onClick={verify} className="fx-btn fx-btn-primary mt-5 w-full py-4">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />} {t("phone.verify")}
                </button>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <button data-testid="phone-resend-btn" onClick={() => start("call")} className="font-semibold text-[#1f7a72]">{t("phone.resend")}</button>
                  <button data-testid="phone-sms-btn" onClick={() => start("sms")} className="flex items-center gap-1.5 font-semibold text-[#6b6b70]"><MessageSquare className="h-4 w-4" /> {t("phone.smsFallback")}</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="cf-rise">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f2f0]"><User className="h-7 w-7 text-[#1f7a72]" /></span>
                <h3 className="mt-4 font-heading text-xl font-bold">{t("phone.nameTitle")}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#6b6b70]">{t("phone.nameSub")}</p>
                <input data-testid="phone-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("phone.namePlaceholder")}
                  className="fx-input mt-4 w-full px-4 py-4 text-base" />
                <button data-testid="phone-name-btn" disabled={busy} onClick={saveName} className="fx-btn fx-btn-primary mt-5 w-full py-4">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />} {t("phone.continue")}
                </button>
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
