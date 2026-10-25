const hosts = [
  'st.com',
  'nxp.com',
  'espressif.com',
  'renesas.com',
  'nordicsemi.com',
  'raspberrypi.com',
  'microchip.com',
  'infineon.com',
  'silabs.com',
  'ti.com',
  'nuvoton.com',
  'ambiq.com',
  'alifsemi.com',
  'lvgl.io',
];
function referenceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid reference URL.');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !hosts.some((host) => url.hostname === host || url.hostname.endsWith('.' + host))
  )
    throw new Error('Reference must use an official vendor or LVGL HTTPS website.');
  return url.href;
}
module.exports = { referenceUrl };
