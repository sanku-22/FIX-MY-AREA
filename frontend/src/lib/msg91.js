// MSG91 OTP Widget loader + promisified helpers.
// Only the public Widget ID + Widget Token live in the frontend (by MSG91 design).
// The MSG91 AuthKey NEVER touches the browser — server verifies the access-token.

const WIDGET_ID = process.env.REACT_APP_MSG91_WIDGET_ID;
const WIDGET_TOKEN = process.env.REACT_APP_MSG91_WIDGET_TOKEN;
const SCRIPT_URLS = [
  "https://verify.msg91.com/otp-provider.js",
  "https://verify.phone91.com/otp-provider.js",
];

export const msg91Enabled = () => Boolean(WIDGET_ID && WIDGET_TOKEN);

let loadPromise = null;

export function loadMsg91() {
  if (!msg91Enabled()) return Promise.reject(new Error("MSG91 is not configured"));
  if (typeof window.sendOtp === "function") return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    let i = 0;
    const attempt = () => {
      const s = document.createElement("script");
      s.src = SCRIPT_URLS[i];
      s.async = true;
      s.onload = () => {
        if (typeof window.initSendOTP === "function") {
          window.initSendOTP({
            widgetId: WIDGET_ID,
            tokenAuth: WIDGET_TOKEN,
            exposeMethods: true, // drive our own UI via window.sendOtp/verifyOtp/retryOtp
            success: () => {},
            failure: () => {},
          });
          resolve();
        } else {
          reject(new Error("OTP provider failed to initialise"));
        }
      };
      s.onerror = () => {
        i += 1;
        if (i < SCRIPT_URLS.length) attempt();
        else reject(new Error("Unable to load the OTP provider. Check your connection."));
      };
      document.head.appendChild(s);
    };
    attempt();
  });
  return loadPromise;
}

// MSG91 identifier = country code + number, digits only, no "+".
export const toIdentifier = (phone) => String(phone || "").replace(/\D/g, "");

export function extractAccessToken(data) {
  if (!data) return null;
  if (typeof data === "string") return data;
  return data.access_token || data.accessToken || data.message || data.token || null;
}

export function friendlyMsg91Error(err, fallback) {
  const raw = (err && (err.message || err.msg || err.error || (typeof err === "string" ? err : ""))) || "";
  const m = String(raw).toLowerCase();
  if (!m) return fallback;
  if (m.includes("maximum") || m.includes("limit") || m.includes("too many")) return "Too many attempts. Please wait a while and try again.";
  if (m.includes("expire")) return "This code has expired. Please request a new one.";
  if (m.includes("invalid") && m.includes("otp")) return "Incorrect code. Please try again.";
  if (m.includes("invalid") && (m.includes("mobile") || m.includes("number") || m.includes("identifier"))) return "That phone number looks invalid. Please check and try again.";
  if (m.includes("network") || m.includes("failed to fetch")) return "Network error. Please check your connection and try again.";
  return raw || fallback;
}

function callMethod(name, ...args) {
  return new Promise((resolve, reject) => {
    const fn = window[name];
    if (typeof fn !== "function") return reject(new Error("OTP provider not ready"));
    fn(...args, (data) => resolve(data), (err) => reject(err));
  });
}

export const sendOtp = (identifier) => callMethod("sendOtp", identifier);
export const verifyOtp = (otp) => callMethod("verifyOtp", otp);
// channel: null = widget default, "11" = SMS, "4" = Voice, "12" = WhatsApp
export const retryOtp = (channel = null) => callMethod("retryOtp", channel);
