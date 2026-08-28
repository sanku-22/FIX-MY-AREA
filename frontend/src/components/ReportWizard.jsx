import React, { useState, useEffect, useCallback } from "react";
import { Drawer } from "vaul";
import { useTranslation } from "react-i18next";
import { Camera, MapPin, Check, Pencil, Loader2, ArrowLeft, X, ImagePlus, ShieldCheck, ShieldAlert } from "lucide-react";
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

  const reset = useCallback(() => {
    setStep(1);
    setPreview(null);
    setPhotoPath(null);
    setFlaggedAi(false);
    setVerifying(false);
    setVerifyError("");
    setPin(null);
    setAddress("");
    setShowAddrPopup(false);
    setConfirmedLocation(false);
    setDescription("");
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (open) {
      reset();
      setPin(userLocation || DEFAULT_CENTER);
    }
  }, [open]); // eslint-disable-line

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setPhotoPath(null);
    setFlaggedAi(false);
    setVerifyError("");
    setVerifying(true);
    try {
      const res = await uploadPhoto(f);
      if (!res.relevant) {
        setVerifyError(res.reason || t("wizard.notRelevant"));
        setPreview(null);
      } else {
        setPhotoPath(res.photo_path);
        setFlaggedAi(!!res.flagged_ai_generated);
        if (res.flagged_ai_generated) toast(t("wizard.aiFlag"));
      }
    } catch (err) {
      setVerifyError(t("wizard.submitError"));
      setPreview(null);
    } finally {
      setVerifying(false);
    }
  };

  const openAddressPopup = async () => {
    setShowAddrPopup(true);
    setAddrLoading(true);
    const addr = await reverseGeocode(pin[0], pin[1]);
    setAddress(addr);
    setAddrLoading(false);
  };

  const confirmAddress = () => {
    setShowAddrPopup(false);
    setConfirmedLocation(true);
    setStep(3);
  };

  const submit = async () => {
    if (!photoPath || !confirmedLocation) return;
    setSubmitting(true);
    try {
      const issue = await createIssue({
        photo_path: photoPath,
        latitude: pin[0],
        longitude: pin[1],
        address_text: address,
        description: description.trim(),
        reporter_id: getDeviceId(),
        reporter_name: user?.name || "Anonymous",
        flagged_ai_generated: flaggedAi,
      });
      toast.success(t("wizard.submitted"), { description: t("wizard.submittedDesc") });
      onOpenChange(false);
      onCreated && onCreated(issue);
    } catch (err) {
      toast.error(t("wizard.submitError"));
      setSubmitting(false);
    }
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[1200] bg-black/50" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[1200] mx-auto flex max-h-[92dvh] max-w-lg flex-col rounded-t-3xl bg-[#f4f4f5] outline-none">
          <Drawer.Title className="sr-only">{t("wizard.title")}</Drawer.Title>
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-gray-300" />

          <div className="flex items-center justify-between px-6 pt-4">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button data-testid="wizard-back-btn" onClick={() => setStep(step - 1)} className="rounded-full p-1 hover:bg-black/5">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <h2 className="font-heading text-2xl font-bold tracking-tight">{t("wizard.title")}</h2>
            </div>
            <button data-testid="wizard-close-btn" onClick={() => onOpenChange(false)} className="rounded-full p-1 hover:bg-black/5">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex gap-1.5 px-6 pt-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-1.5 flex-1 rounded-full transition-colors" style={{ backgroundColor: n <= step ? "#09090b" : "#e4e4e7" }} />
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-8 pt-5">
            {step === 1 && (
              <div className="cf-rise">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717a]">{t("wizard.step1")}</p>
                <h3 className="mt-1 font-heading text-xl font-semibold">{t("wizard.snap")}</h3>
                <label data-testid="photo-upload-label" className="mt-4 flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-white">
                  {preview ? (
                    <img src={preview} alt="preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[#71717a]">
                      <Camera className="h-10 w-10" />
                      <span className="px-6 text-center text-sm font-medium">{t("wizard.tapToOpen")}</span>
                    </div>
                  )}
                  <input data-testid="photo-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
                </label>

                {verifying && (
                  <div data-testid="verify-loading" className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-[#71717a]">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("wizard.verifying")}
                  </div>
                )}
                {verifyError && (
                  <div data-testid="verify-error" className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-600">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {verifyError}
                  </div>
                )}
                {photoPath && !flaggedAi && (
                  <div className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-emerald-600">
                    <ShieldCheck className="h-4 w-4" /> Verified
                  </div>
                )}
                {photoPath && flaggedAi && (
                  <div data-testid="ai-flag-note" className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {t("wizard.aiFlag")}
                  </div>
                )}
                {preview && !verifying && (
                  <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-sm font-semibold text-[#09090b]">
                    <ImagePlus className="h-4 w-4" /> {t("wizard.changePhoto")}
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
                  </label>
                )}

                <button data-testid="photo-next-btn" disabled={!photoPath || verifying} onClick={() => setStep(2)} className="mt-6 w-full rounded-full bg-[#09090b] py-4 text-base font-semibold text-white transition-transform duration-200 enabled:hover:-translate-y-0.5 disabled:opacity-40">
                  {t("wizard.continue")}
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="cf-rise">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717a]">{t("wizard.step2")}</p>
                <h3 className="mt-1 font-heading text-xl font-semibold">{t("wizard.pinSpot")}</h3>
                <p className="mt-1 text-sm text-[#71717a]">{t("wizard.dragHint")}</p>
                <div className="mt-4 h-64 w-full overflow-hidden rounded-2xl border border-[#e4e4e7]">
                  {pin && <MapView center={pin} zoom={16} draggableMarker={pin} onDragMarker={setPin} onMapClick={setPin} />}
                </div>
                <p className="mt-2 font-mono-tech text-xs text-[#71717a]">
                  {pin ? `${pin[0].toFixed(5)}, ${pin[1].toFixed(5)}` : t("wizard.locating")}
                </p>
                <button data-testid="confirm-location-btn" onClick={openAddressPopup} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#09090b] py-4 text-base font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5">
                  <MapPin className="h-5 w-5" /> {t("wizard.confirmLocation")}
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="cf-rise">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717a]">{t("wizard.step3")}</p>
                <h3 className="mt-1 font-heading text-xl font-semibold">{t("wizard.addDescription")}</h3>
                <p className="mt-1 text-sm text-[#71717a]">{t("wizard.descOptional")}</p>
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-white p-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#71717a]" />
                  <p className="text-sm leading-relaxed text-[#09090b]">{address}</p>
                </div>
                <textarea data-testid="description-input" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))} rows={4} placeholder={t("wizard.descPlaceholder")} className="mt-4 w-full resize-none rounded-xl bg-white p-4 text-sm outline-none ring-black focus:ring-2" />
                <p className="mt-1 text-right text-xs text-[#71717a]">{description.length}/500</p>
                <button data-testid="submit-report-btn" disabled={submitting || !photoPath || !confirmedLocation} onClick={submit} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#09090b] py-4 text-base font-semibold text-white transition-transform duration-200 enabled:hover:-translate-y-0.5 disabled:opacity-50">
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                  {submitting ? t("wizard.submitting") : t("wizard.submit")}
                </button>
              </div>
            )}
          </div>

          {showAddrPopup && (
            <div className="absolute inset-0 z-[1300] flex items-end bg-black/40">
              <div className="cf-rise w-full rounded-t-3xl bg-white p-6">
                <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-300" />
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717a]">{t("wizard.confirmAddress")}</p>
                <div className="mt-3 flex min-h-[64px] items-start gap-2 rounded-xl bg-[#f4f4f5] p-4">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#09090b]" />
                  {addrLoading ? (
                    <span className="flex items-center gap-2 text-sm text-[#71717a]"><Loader2 className="h-4 w-4 animate-spin" /> {t("wizard.addressLocating")}</span>
                  ) : (
                    <p data-testid="resolved-address" className="text-sm leading-relaxed">{address}</p>
                  )}
                </div>
                <div className="mt-5 flex gap-3">
                  <button data-testid="address-edit-btn" onClick={() => setShowAddrPopup(false)} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#e4e4e7] bg-white py-3.5 text-sm font-semibold">
                    <Pencil className="h-4 w-4" /> {t("wizard.edit")}
                  </button>
                  <button data-testid="address-confirm-btn" disabled={addrLoading} onClick={confirmAddress} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#09090b] py-3.5 text-sm font-semibold text-white disabled:opacity-40">
                    <Check className="h-4 w-4" /> {t("wizard.confirm")}
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
