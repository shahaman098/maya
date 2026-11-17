const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel) {
  return (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld("mayaDesktop", {
  isDesktop: true,
  hardware: () => ipcRenderer.invoke("maya:hardware"),
  checkOllama: () => ipcRenderer.invoke("maya:ollama-check"),
  installOllama: () => ipcRenderer.invoke("maya:ollama-install"),
  startOllama: () => ipcRenderer.invoke("maya:ollama-start"),
  pullModel: (model) => ipcRenderer.invoke("maya:ollama-pull", model),
  onOllamaProgress: subscribe("maya:ollama-progress"),
  onInstallProgress: subscribe("maya:install-progress"),
  setupState: () => ipcRenderer.invoke("maya:setup-state"),
  completeSetup: (mode) => ipcRenderer.invoke("maya:setup-complete", mode),
  resetSetup: () => ipcRenderer.invoke("maya:setup-reset"),
  openExternal: (url) => ipcRenderer.invoke("maya:open-external", url),
  dataPath: () => ipcRenderer.invoke("maya:data-path"),
});
