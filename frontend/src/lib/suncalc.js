// Lightweight NOAA-based sunrise/sunset. Returns whether it's night at loc now.
function toRad(d) { return (d * Math.PI) / 180; }
function toDeg(r) { return (r * 180) / Math.PI; }

function sunTimesUTC(date, lat, lng) {
  const rad = Math.PI / 180;
  const dayMs = 1000 * 60 * 60 * 24;
  const J1970 = 2440588, J2000 = 2451545;
  const toJulian = (d) => d.valueOf() / dayMs - 0.5 + J1970;
  const days = toJulian(date) - J2000;
  const M = rad * (357.5291 + 0.98560028 * days);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372;
  const L = M + C + P + Math.PI;
  const dec = Math.asin(Math.sin(L) * Math.sin(rad * 23.4397));
  const lw = rad * -lng;
  const n = Math.round(days - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const Ms = rad * (357.5291 + 0.98560028 * (ds * 1)) ;
  const Jtransit = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const h = -0.833 * rad;
  const w0 = Math.acos((Math.sin(h) - Math.sin(rad * lat) * Math.sin(dec)) / (Math.cos(rad * lat) * Math.cos(dec)));
  const Jset = Jtransit + w0 / (2 * Math.PI);
  const Jrise = Jtransit - w0 / (2 * Math.PI);
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) };
}

export function isNight(lat, lng, when = new Date()) {
  try {
    const { sunrise, sunset } = sunTimesUTC(when, lat, lng);
    if (isNaN(sunrise) || isNaN(sunset)) return false;
    return when < sunrise || when > sunset;
  } catch (e) {
    return false;
  }
}
