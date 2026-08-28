export function getDeviceId() {
  let id = localStorage.getItem("cf_device_id");
  if (!id) {
    id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("cf_device_id", id);
  }
  return id;
}
