const strip = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');
function probes(text) {
  const result = [];
  for (const block of strip(text).split(/(?=ST-LINK\s+SN\s*:|STLink\s+Serial\s*:)/i)) {
    const serial = block.match(
      /(?:ST-LINK\s+SN|STLink\s+Serial)[ \t]*:[ \t]*([a-z0-9]{8,64})/i,
    )?.[1];
    if (serial)
      result.push({
        serial,
        board: block.match(/Board\s+Name[ \t]*:[ \t]*([^\r\n]*)/i)?.[1]?.trim() || 'ST-LINK board',
      });
  }
  return result;
}
function metrics(text) {
  const values = [];
  for (const line of strip(text).split(/\r?\n/)) {
    const row = line.match(/^\s*(?:0x)?[0-9a-f]{8}\s*:\s*(.*)$/i);
    if (row)
      for (const v of row[1].matchAll(/\b(?:0x)?([0-9a-f]{8})\b/gi))
        values.push(parseInt(v[1], 16));
  }
  if (
    values.length < 12 ||
    values[0] !== 0x4c47454d ||
    values[1] !== 1 ||
    values[2] % 2 ||
    values[2] !== values[11]
  )
    return null;
  return {
    uptimeMs: values[3],
    frames: values[4],
    fps: values[5] / 1000,
    renderUs: values[6],
    flushUs: values[7],
    gpuIrqs: values[8],
    accelerated: !!(values[9] & 1),
    freeHeap: values[10],
  };
}
module.exports = { strip, probes, metrics };
