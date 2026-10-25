const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('engineDesktop', {
  inputDeviceSelect: (kind, id) => invoke('desktop:input-device-select', kind, id),
  onInputDevicePicker: (callback) => {
    const listener = (_event, picker) => callback(picker);
    ipcRenderer.on('desktop:input-picker', listener);
    return () => ipcRenderer.removeListener('desktop:input-picker', listener);
  },
  agentResponse: (reply) => invoke('desktop:agent-response', reply),
  onAgentRequest: (callback) => {
    const listener = (_event, request) => callback(request);
    ipcRenderer.on('desktop:agent-request', listener);
    return () => ipcRenderer.removeListener('desktop:agent-request', listener);
  },
  boardCapabilities: () => invoke('desktop:board-capabilities'),
  boardConfigure: (c) => invoke('desktop:board-configure', c),
  boardScan: () => invoke('desktop:board-scan'),
  boardBuild: (entries, options) => invoke('desktop:board-build', entries, options),
  boardFlash: (r) => invoke('desktop:board-flash', r),
  boardMonitor: (id, serial) => invoke('desktop:board-monitor', id, serial),
  boardStopMonitor: () => invoke('desktop:board-stop-monitor'),
  boardCancel: () => invoke('desktop:board-cancel'),
  onBoardEvent: (callback) => {
    const listener = (_e, message) => callback(message);
    ipcRenderer.on('desktop:board-event', listener);
    return () => ipcRenderer.removeListener('desktop:board-event', listener);
  },
  nativeCapabilities: () => invoke('desktop:native-capabilities'),
  nativeStart: (request) => invoke('desktop:native-start', request),
  nativeControl: (id, command) => invoke('desktop:native-control', id, command),
  nativeStop: (id) => invoke('desktop:native-stop', id),
  onNativeEvent: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('desktop:native-event', listener);
    return () => ipcRenderer.removeListener('desktop:native-event', listener);
  },
  bootstrap: () => invoke('desktop:bootstrap'),
  copyText: (text) => invoke('desktop:copy-text', text),
  openReference: (url) => invoke('desktop:open-reference', url),
  openProject: () => invoke('desktop:open-project'),
  openPending: () => invoke('desktop:open-pending'),
  openRecent: (index) => invoke('desktop:open-recent', index),
  acceptProject: (ticket) => invoke('desktop:accept-project', ticket),
  saveProject: (text, saveAs = false) => invoke('desktop:save-project', text, saveAs),
  confirmDiscard: (text) => invoke('desktop:confirm-discard', text),
  newDocument: () => invoke('desktop:new-document'),
  setDocumentState: (state) => invoke('desktop:document-state', state),
  saveRecovery: (text, dirty) => invoke('desktop:save-recovery', text, dirty),
  chooseExportFolder: () => invoke('desktop:choose-export-folder'),
  exportUi: (entries, projectId, replaceModified = false) =>
    invoke('desktop:export-ui', entries, projectId, replaceModified),
  saveArchive: (bytes, name) => invoke('desktop:save-archive', bytes, name),
  revealExport: () => invoke('desktop:reveal-export'),
  closeResponse: (approved) => invoke('desktop:close-response', approved),
  onAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('desktop:action', listener);
    return () => ipcRenderer.removeListener('desktop:action', listener);
  },
});
