const { app, BrowserWindow, protocol, Menu, dialog, shell, session, screen, ipcMain, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HOME = 'qingzhou://app/';
const ALLOWED_FILES = new Set(['index.html', 'app.js', 'styles.css', 'core.mjs', 'planner.mjs', 'curriculum.mjs', 'icon.svg']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const EXTERNAL_HOSTS = new Set(['yankao.neea.edu.cn', 'yz.chsi.com.cn']);
let mainWindow;
let studyReady = false;

// 固定数据目录，更新或更改安装路径后仍保留学习记录。
const testProfile = process.env.QINGZHOU_TEST_PROFILE;
app.setPath('userData', testProfile ? path.resolve(testProfile) : path.join(app.getPath('appData'), 'QingzhouStudy'));
app.setAppUserModelId('cn.qingzhou.study');
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{ scheme: 'qingzhou', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function isInternal(url) {
  try { const u = new URL(url); return u.protocol === 'qingzhou:' && u.host === 'app'; } catch { return false; }
}
function openReference(url) {
  try { const u = new URL(url); if (u.protocol === 'https:' && EXTERNAL_HOSTS.has(u.host)) shell.openExternal(u.href); } catch {}
}
function go(route) { if (studyReady && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.executeJavaScript(`location.hash = ${JSON.stringify(route)};`); }

function makeMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '轻舟', submenu: [
      { id: 'study-settings', label: '设置与备份', enabled: studyReady, accelerator: 'CmdOrCtrl+,', click: () => go('settings') },
      { type: 'separator' },
      { label: '关于轻舟', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: '关于轻舟', message: `轻舟学习助手 ${app.getVersion()}`, detail: '整理考研知识、制定计划与记录进步。\n\n数学一/二、英语一/二可分别选择；包含计算机 408 与思想政治规划。\n1.0.6 保留 v4 本机记录；可随时备份。' }) },
      { label: '退出', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
    ] },
    { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    { id: 'study-navigation', label: '学习', enabled: studyReady, submenu: [
      { label: '学习总览', click: () => go('dashboard') }, { label: '知识地图', click: () => go('knowledge') },
      { label: '学习计划', click: () => go('plan') }, { label: '间隔复习', click: () => go('review') },
      { label: '学习统计', click: () => go('analytics') }, { label: '专注空间', click: () => go('focus') }
    ] },
    { label: '视图', submenu: [{ role: 'reload', label: '刷新', accelerator: 'CmdOrCtrl+R' }, { role: 'resetZoom', label: '原始大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { type: 'separator' }, { role: 'togglefullscreen', label: '全屏' }] }
  ]));
}

async function createWindow() {
  const work = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1440, work.width), height: Math.min(960, work.height), minWidth: 900, minHeight: 620,
    title: '轻舟学习助手', icon: path.join(ROOT, 'resources', 'icon.ico'), backgroundColor: '#f6f7f4', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged || Boolean(testProfile) }
  });
  mainWindow.once('ready-to-show', () => { if (!testProfile) mainWindow.show(); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openReference(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!isInternal(url)) { event.preventDefault(); openReference(url); } });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.on('will-prevent-unload', event => {
    const response=dialog.showMessageBoxSync(mainWindow,{type:'question',buttons:['继续编辑','放弃未保存输入'],defaultId:0,cancelId:0,title:'还有未保存的输入',message:'草案和正式记录已保留。是否放弃当前表单输入并离开？'});
    if(response===1)event.preventDefault();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(HOME);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    protocol.handle('qingzhou', async request => {
      const url = new URL(request.url);
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (url.host !== 'app' || !ALLOWED_FILES.has(file)) return new Response('Not found', { status: 404 });
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      try {
        const body = request.method === 'HEAD' ? null : await fs.promises.readFile(path.join(ROOT, file));
        return new Response(body, { headers: {
          'Content-Type': MIME[path.extname(file)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
        } });
      } catch { return new Response('Unable to read application files', { status: 500 }); }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    function trustedSender(event) {
      return mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && isInternal(event.senderFrame.url);
    }
    ipcMain.handle('study:set-ready', (event, ready) => {
      if(!trustedSender(event)||typeof ready!=='boolean')return {ok:false};
      studyReady=ready;
      const menu=Menu.getApplicationMenu();
      for(const id of ['study-settings','study-navigation']){const item=menu?.getMenuItemById(id);if(item)item.enabled=ready;}
      return {ok:true};
    });
    ipcMain.handle('study:contact-developer', async event => {
      if (!trustedSender(event)) return { ok: false };
      try { await shell.openExternal('mailto:2024304827@aust.edu.cn'); return { ok: true }; } catch { return { ok: false }; }
    });
    ipcMain.handle('study:copy-developer-email', event => {
      if (!trustedSender(event)) return { ok: false };
      try { clipboard.writeText('2024304827@aust.edu.cn'); return { ok: true }; } catch { return { ok: false }; }
    });
    ipcMain.handle('study:save-backup', async (event, payload) => {
      if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !isInternal(event.senderFrame.url) ||
          !payload || typeof payload.content !== 'string' || Buffer.byteLength(payload.content, 'utf8') > 30 * 1024 * 1024 || typeof payload.filename !== 'string') {
        return { saved: false, error: '无法读取待保存的备份内容。' };
      }
      const filename = path.basename(payload.filename).slice(0, 150);
      const selected = await dialog.showSaveDialog(mainWindow, {
        title: '保存学习备份', defaultPath: path.join(app.getPath('documents'), filename.endsWith('.json') ? filename : '轻舟学习备份.json'),
        filters: [{ name: '轻舟备份文件', extensions: ['json'] }]
      });
      if (selected.canceled || !selected.filePath) return { saved: false, cancelled: true };
      try { await fs.promises.writeFile(selected.filePath, payload.content, 'utf8'); return { saved: true }; }
      catch { return { saved: false, error: '备份保存失败，请换一个保存位置后重试。' }; }
    });
    session.defaultSession.on('will-download', (_event, item) => {
      const selected = dialog.showSaveDialogSync(mainWindow, {
        title: '保存学习备份', defaultPath: path.join(app.getPath('documents'), item.getFilename()),
        filters: [{ name: '轻舟备份文件', extensions: ['json'] }]
      });
      if (!selected) { item.cancel(); return; }
      item.setSavePath(selected);
      item.once('done', (_event, status) => { if (status !== 'completed' && status !== 'cancelled') dialog.showMessageBox(mainWindow, { type: 'error', title: '备份未完成', message: '未能保存备份文件，请换一个保存位置后重试。' }); });
    });
    makeMenu();
    await createWindow();
  }).catch(error => { dialog.showErrorBox('轻舟启动失败', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
