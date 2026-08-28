import React, { useState, useEffect, useCallback } from "react";
import { Drawer } from "vaul";
import { Camera, MapPin, Check, Pencil, Loader2, ArrowLeft, X, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import MapView from "@/components/MapView";
import { reverseGeocode } from "@/lib/geo";
import { uploadPhoto, createIssue } from "@/lib/api";
import { getDeviceId } from "@/lib/device";
import { DEFAULT_CENTER } from "@/lib/constants";

export default function ReportWizard({ open, onOpenChange, userLocation, onCreated }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pin, setPin] = useState(null);
  const [address, setAddress] = useState("");
  const [addrLoading, setAddrLoading] = useState(false);
  const [showAddrPopup, setShowAddrPopup] = useState(false);
  const [confirmedLocation, setConfirmedLocation] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setStep(1);
    setFile(null);
    setPreview(null);
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

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
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
    if (!file || !confirmedLocation) return;
    setSubmitting(true);
    try {
      const photoPath = await uploadPhoto(file);
      const issue = await createIssue({
        photo_path: photoPath,
        latitude: pin[0],
        longitude: pin[1],
        address_text: address,
        description: description.trim(),
        reporter_id: getDeviceId(),
        reporter_name: "Anonymous",
      });
      toast.success("Report submitted!", { description: "Your issue is now live on the map." });
      onOpenChange(false);
      onCreated && onCreated(issue);
    } catch (err) {
      toast.error("Could not submit report. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[1200] bg-black/50" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[1200] mx-auto flex max-h-[92dvh] max-w-lg flex-col rounded-t-3xl bg-[#f4f4f5] outline-none">
          <Drawer.Title className="sr-only">Report an Issue</Drawer.Title>
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-gray-300" />

          <div className="flex items-center justify-between px-6 pt-4">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  data-testid="wizard-back-btn"
                  onClick={() => setStep(step - 1)}
                  className="rounded-full p-1 hover:bg-black/5"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <h2 className="font-heading text-2xl font-bold tracking-tight">Report an Issue</h2>
            </div>
            <button
              data-testid="wizard-close-btn"
              onClick={() => onOpenChange(false)}
              className="rounded-full p-1 hover:bg-black/5"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* progress */}
          <div className="flex gap-1.5 px-6 pt-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-1.5 flex-1 rounded-full transition-colors"
                style={{ backgroundColor: n <= step ? "#09090b" : "#e4e4e7" }}
              />
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-8 pt-5">
            {step === 1 && (
              <div className="cf-rise">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717a]">Step 1 · Photo</p>
                <h3 className="mt-1 font-heading text-xl font-semibold">Snap the issue</h3>
                <label
                  data-testid="photo-upload-label"
                  className="mt-4 flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-white"
                >
                  {preview ? (
                    <img src={preview} alt="preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[#71717a]">
                      <Camera className="h-10 w-10" />
                      <span className="text-sm font-medium">Tap to open camera or gallery</span>
                    </div>
                  )}
                  <input
                    data-testid="photo-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFile}
                  />
                </label>
                {preview && (
                  <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-sm font-semibold text-[#09090b]">
                    <ImagePlus className="h-4 w-4" /> Change photo
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
                  </label>
                )}
                <button
                  data-testid="photo-next-btn"
                  disabled={!file}
                  onClick={() => setStep(2)}
                  className="mt-6 w-full rounded-full bg-[#09090b] py-4 text-base font-semibold text-white transition-transform duration-200 enabled:hover:-translate-y-0.5 disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="cf-rise">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717a]">Step 2 · Location</p>
                <h3 className="mt-1 font-heading text-xl font-semibold">Pin the exact spot</h3>
                <p className="mt-1 text-sm text-[#71717a]">Drag the pin or tap the map to adjust.</p>
                <div className="mt-4 h-64 w-full overflow-hidden rounded-2xl border border-[#e4e4e7]">
                  {pin && (
                    <MapView
                      center={pin}
                      zoom={16}
                      draggableMarker={pin}
                      onDragMarker={setPin}
                      onMapClick={setPin}
                    />
                  )}
                </div>
                <p className="mt-2 font-mono-tech text-xs text-[#71717a]">
                  {pin ? `${pin[0].toFixed(5)}, ${pin[1].toFixed(5)}` : "Locating…"}
                </p>
                <button
                  data-testid="confirm-location-btn"
                  onClick={openAddressPopup}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#09090b] py-4 text-base font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <MapPin className="h-5 w-5" /> Confirm Location
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="cf-rise">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717a]">Step 3 · Details</p>
                <h3 className="mt-1 font-heading text-xl font-semibold">Add a description</h3>
                <p className="mt-1 text-sm text-[#71717a]">Optional — helps us categorize the issue.</p>
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-white p-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#71717a]" />
                  <p className="text-sm leading-relaxed text-[#09090b]">{address}</p>
                </div>
                <textarea
                  data-testid="description-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                  rows={4}
                  placeholder="e.g. Large pothole near the bus stop, dangerous for two-wheelers."
                  className="mt-4 w-full resize-none rounded-xl bg-white p-4 text-sm outline-none ring-black focus:ring-2"
                />
                <p className="mt-1 text-right text-xs text-[#71717a]">{description.length}/500</p>
                <button
                  data-testid="submit-report-btn"
                  disabled={submitting || !file || !confirmedLocation}
                  onClick={submit}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#09090b] py-4 text-base font-semibold text-white transition-transform duration-200 enabled:hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                  {submitting ? "Submitting…" : "Submit Report"}
                </button>
              </div>
            )}
          </div>

          {/* Address confirmation popup */}
          {showAddrPopup && (
            <div className="absolute inset-0 z-[1300] flex items-end bg-black/40">
              <div className="cf-rise w-full rounded-t-3xl bg-white p-6">
                <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-300" />
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71717a]">Confirm address</p>
                <div className="mt-3 flex min-h-[64px] items-start gap-2 rounded-xl bg-[#f4f4f5] p-4">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#09090b]" />
                  {addrLoading ? (
                    <span className="flex items-center gap-2 text-sm text-[#71717a]">
                      <Loader2 className="h-4 w-4 animate-spin" /> Locating address…
                    </span>
                  ) : (
                    <p data-testid="resolved-address" className="text-sm leading-relaxed">{address}</p>
                  )}
                </div>
                <div className="mt-5 flex gap-3">
                  <button
                    data-testid="address-edit-btn"
                    onClick={() => setShowAddrPopup(false)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#e4e4e7] bg-white py-3.5 text-sm font-semibold"
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                  <button
                    data-testid="address-confirm-btn"
                    disabled={addrLoading}
                    onClick={confirmAddress}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#09090b] py-3.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    <Check className="h-4 w-4" /> Confirm
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
