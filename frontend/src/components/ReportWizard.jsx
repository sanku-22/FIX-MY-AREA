import React, { useState, useEffect, useCallback } from "react";
import { Drawer } from "vaul";
import { useTranslation } from "react-i18next";
import { Camera, MapPin, Check, Pencil, Loader2, ArrowLeft, X, ImagePlus, ShieldCheck, ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import MapView from "@/components/MapView";
import { uploadPhoto, createIssue, reverseGeocode } from "@/lib/api";
import { getDeviceId } from "@/lib/device";
import { DEFAULT_CENTER } from "@/lib/constants";
import { useAuth } from "@/context/AuthContext";

export default function ReportWizard({ open, onOpenChange, userLocation, onCreated }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState(null);
  const [photoPath, setPhotoPath] = useState(null);
  const [flaggedAi, setFlaggedAi] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [pin, setPin] = useState(null);
  const [address, setAddress] = useState("");
  const [addrLoading, setAddrLoading] = useState(false);
  const [showAddrPopup, setShowAddrPopup] = useState(false);
  const [confirmedLocation, setConfirmedLocation] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const reset = useCallback(() => {
    setStep(1); setPreview(null); setPhotoPath(null); setFlaggedAi(false);
    setVerifying(false); setVerifyError(""); setPin(null); setAddress("");
    setShowAddrPopup(false); setConfirmedLocation(false); setDescription("");
    setSubmitting(false); setSuccess(false);
  }, []);

  useEffect(() => {
    if (open) { reset(); setPin(userLocation || DEFAULT_CENTER); }
  }, [open]); // eslint-disable-line

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setPhotoPath(null); setFlaggedAi(false); setVerifyError(""); setVerifying(true);
    try {
      const res = await uploadPhoto(f);
      if (!res.relevant) {
        const codeMap = {
          not_civic: "wizard.reject_not_civic",
          low_confidence: "wizard.reject_low_confidence",
          ai_generated: "wizard.reject_ai_generated",
        };
        const key = codeMap[res.reject_code];
        setVerifyError(key ? t(key) : res.reason || t("wizard.notRelevant"));
        setPreview(null);
      } else {
        setPhotoPath(res.photo_path); setFlaggedAi(!!res.flagged_ai_generated);
        if (res.flagged_ai_generated) toast(t("wizard.aiFlag"));
      }
    } catch (err) { setVerifyError(t("wizard.submitError")); setPreview(null); }
    finally { setVerifying(false); }
  };

  const openAddressPopup = async () => {
    setShowAddrPopup(true); setAddrLoading(true);
    const addr = await reverseGeocode(pin[0], pin[1]);
    setAddress(addr); setAddrLoading(false);
  };

  const confirmAddress = () => { setShowAddrPopup(false); setConfirmedLocation(true); setStep(3); };

  const submit = async () => {
    if (!photoPath || !confirmedLocation) return;
    setSubmitting(true);
    try {
      const issue = await createIssue({
        photo_path: photoPath, latitude: pin[0], longitude: pin[1], address_text: address,
        description: description.trim(), reporter_id: getDeviceId(),
        reporter_name: user?.name || "Anonymous", flagged_ai_generated: flaggedAi,
      });
      setSuccess(true);
      setTimeout(() => { onOpenChange(false); onCreated && onCreated(issue); }, 1800);
    } catch (err) { toast.error(t("wizard.submitError")); setSubmitting(false); }
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[1200] bg-black/40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[1200] mx-auto flex max-h-[92dvh] max-w-lg flex-col rounded-t-3xl bg-[#f6f5f1] outline-none">
          <Drawer.Title className="sr-only">{t("wizard.title")}</Drawer.Title>

          {success ? (
            <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
              <div className="cf-pop flex h-20 w-20 items-center justify-center rounded-full bg-[#e7f4ec]">
                <CheckCircle2 className="h-11 w-11 text-[#4e9e74]" strokeWidth={2.2} />
              </div>
              <h2 className="mt-6 font-heading text-2xl font-bold text-[#2a2a2c]">{t("wizard.successTitle")}</h2>
              <p className="mt-2 max-w-xs text-base leading-relaxed text-[#6b6b70]">{t("wizard.successText")}</p>
            </div>
          ) : (
            <>
              <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-[#d9d6cd]" />
              <div className="flex items-center justify-between px-6 pt-4">
                <div className="flex items-center gap-2">
                  {step > 1 && (
                    <button data-testid="wizard-back-btn" onClick={() => setStep(step - 1)} className="rounded-full p-1.5 hover:bg-black/5">
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                  )}
                  <h2 className="font-heading text-2xl font-bold tracking-tight">{t("wizard.title")}</h2>
                </div>
                <button data-testid="wizard-close-btn" onClick={() => onOpenChange(false)} className="rounded-full p-1.5 hover:bg-black/5">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex gap-1.5 px-6 pt-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-1.5 flex-1 rounded-full transition-colors" style={{ backgroundColor: n <= step ? "#1f7a72" : "#e6e3dc" }} />
                ))}
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-8 pt-6">
                {step === 1 && (
                  <div className="cf-rise">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1f7a72]">{t("wizard.step1")}</p>
                    <h3 className="mt-1.5 font-heading text-xl font-bold">{t("wizard.snap")}</h3>
                    <label data-testid="photo-upload-label" className="mt-4 flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[#c9d6d4] bg-[#f0f6f5] transition-colors hover:border-[#1f7a72] hover:bg-[#e8f2f0]">
                      {preview ? (
                        <img src={preview} alt="preview" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center gap-3 px-6 text-center">
                          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
                            <Camera className="h-7 w-7 text-[#1f7a72]" />
                          </span>
                          <span className="text-base font-semibold text-[#2a2a2c]">{t("wizard.photoLabel")}</span>
                          <span className="text-sm text-[#6b6b70]">{t("wizard.photoHint")}</span>
                        </div>
                      )}
                      <input data-testid="photo-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
                    </label>

                    {verifying && (
                      <div data-testid="verify-loading" className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-[#6b6b70]">
                        <Loader2 className="h-4 w-4 animate-spin" /> {t("wizard.verifying")}
                      </div>
                    )}
                    {verifyError && (
                      <div data-testid="verify-error" className="mt-4 flex items-start gap-2 rounded-xl bg-[#fbeee2] p-3 text-sm text-[#b06a2c]">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {verifyError}
                      </div>
                    )}
                    {photoPath && !flaggedAi && (
                      <div className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-[#4e9e74]">
                        <ShieldCheck className="h-4 w-4" /> {t("wizard.verified")}
                      </div>
                    )}
                    {photoPath && flaggedAi && (
                      <div data-testid="ai-flag-note" className="mt-4 flex items-start gap-2 rounded-xl bg-[#fbeee2] p-3 text-sm text-[#b06a2c]">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {t("wizard.aiFlag")}
                      </div>
                    )}
                    {preview && !verifying && (
                      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-sm font-semibold text-[#1f7a72]">
                        <ImagePlus className="h-4 w-4" /> {t("wizard.changePhoto")}
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
                      </label>
                    )}

                    <button data-testid="photo-next-btn" disabled={!photoPath || verifying} onClick={() => setStep(2)} className="fx-btn fx-btn-primary mt-6 w-full py-4">
                      {t("wizard.continue")}
                    </button>
                  </div>
                )}

                {step === 2 && (
                  <div className="cf-rise">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1f7a72]">{t("wizard.step2")}</p>
                    <h3 className="mt-1.5 font-heading text-xl font-bold">{t("wizard.pinSpot")}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#6b6b70]">{t("wizard.dragHint")}</p>
                    <div className="mt-4 h-64 w-full overflow-hidden rounded-2xl border border-[#e6e3dc]">
                      {pin && <MapView center={pin} zoom={16} draggableMarker={pin} onDragMarker={setPin} onMapClick={setPin} />}
                    </div>
                    <p className="mt-2 font-mono-tech text-xs text-[#6b6b70]">
                      {pin ? `${pin[0].toFixed(5)}, ${pin[1].toFixed(5)}` : t("wizard.locating")}
                    </p>
                    <button data-testid="confirm-location-btn" onClick={openAddressPopup} className="fx-btn fx-btn-primary mt-5 w-full py-4">
                      <MapPin className="h-5 w-5" /> {t("wizard.confirmLocation")}
                    </button>
                  </div>
                )}

                {step === 3 && (
                  <div className="cf-rise">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1f7a72]">{t("wizard.step3")}</p>
                    <h3 className="mt-1.5 font-heading text-xl font-bold">{t("wizard.addDescription")}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#6b6b70]">{t("wizard.descOptional")}</p>
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-white p-3.5 border border-[#e6e3dc]">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#1f7a72]" />
                      <p className="text-sm leading-relaxed text-[#2a2a2c]">{address}</p>
                    </div>
                    <textarea data-testid="description-input" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))} rows={4} placeholder={t("wizard.descPlaceholder")} className="fx-input mt-4 w-full resize-none p-4 text-sm leading-relaxed" />
                    <p className="mt-1 text-right text-xs text-[#6b6b70]">{description.length}/500</p>
                    <button data-testid="submit-report-btn" disabled={submitting || !photoPath || !confirmedLocation} onClick={submit} className="fx-btn fx-btn-primary mt-4 w-full py-4">
                      {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                      {submitting ? t("wizard.submitting") : t("wizard.submit")}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {showAddrPopup && !success && (
            <div className="absolute inset-0 z-[1300] flex items-end bg-black/40">
              <div className="cf-rise w-full rounded-t-3xl bg-white p-6">
                <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#d9d6cd]" />
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1f7a72]">{t("wizard.confirmAddress")}</p>
                <div className="mt-3 flex min-h-[64px] items-start gap-3 rounded-xl bg-[#f6f5f1] p-4">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#1f7a72]" />
                  {addrLoading ? (
                    <span className="flex items-center gap-2 text-sm text-[#6b6b70]"><Loader2 className="h-4 w-4 animate-spin" /> {t("wizard.addressLocating")}</span>
                  ) : (
                    <p data-testid="resolved-address" className="text-base leading-relaxed text-[#2a2a2c]">{address}</p>
                  )}
                </div>
                <div className="mt-5 flex flex-col gap-2.5">
                  <button data-testid="address-confirm-btn" disabled={addrLoading} onClick={confirmAddress} className="fx-btn fx-btn-primary w-full py-4">
                    <Check className="h-5 w-5" /> {t("wizard.confirm")}
                  </button>
                  <button data-testid="address-edit-btn" onClick={() => setShowAddrPopup(false)} className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-[#6b6b70] hover:text-[#2a2a2c]">
                    <Pencil className="h-4 w-4" /> {t("wizard.edit")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
