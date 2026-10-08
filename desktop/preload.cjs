const { contextBridge, ipcRenderer } = require('electron');
// 只提供带原生保存对话框的备份操作，不向学习界面开放文件系统或 Node.js。
contextBridge.exposeInMainWorld('qingzhouDesktop', {
  saveBackup: (content, filename) => ipcRenderer.invoke('study:save-backup', { content, filename }),
  contactDeveloper: () => ipcRenderer.invoke('study:contact-developer'),
  copyDeveloperEmail: () => ipcRenderer.invoke('study:copy-developer-email'),
  setStudyReady: ready => ipcRenderer.invoke('study:set-ready', ready)
});
