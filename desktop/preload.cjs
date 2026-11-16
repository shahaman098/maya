const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mayaDesktop", {
  isDesktop: true,
  hardware: () => ipcRenderer.invoke("maya:hardware"),
  checkOllama: () => ipcRenderer.invoke("maya:ollama-check"),
  pullModel: (model) => ipcRenderer.invoke("maya:ollama-pull", model),
  onOllamaProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("maya:ollama-progress", listener);
    return () => ipcRenderer.removeListener("maya:ollama-progress", listener);
  },
  openExternal: (url) => ipcRenderer.invoke("maya:open-external", url),
  dataPath: () => ipcRenderer.invoke("maya:data-path"),
});
