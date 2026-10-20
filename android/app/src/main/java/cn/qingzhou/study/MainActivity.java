package cn.qingzhou.study;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView web;
    private String pendingExport;
    private static final int EXPORT = 200, IMPORT = 201, NOTIFY = 202;
    @Override public void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(244,247,243));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(244,247,243));
        root.addView(web, new FrameLayout.LayoutParams(-1,-1));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        root.setOnApplyWindowInsetsListener((view,insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        root.requestApplyInsets();
        applyAppearance();
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse local = loader.shouldInterceptRequest(request.getUrl());
                if (local != null) return local;
                return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",java.util.Collections.emptyMap(),
                    new java.io.ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl();
                if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())) return false;
                return true;
            }
            @Override public void onPageFinished(WebView view,String url) { notifyWeb("resume", null);dispatchIntent(); }
        });
        web.addJavascriptInterface(new Bridge(), "QingzhouAndroid");
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html");
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);dispatchIntent();}
    private void dispatchIntent(){if(getIntent().getBooleanExtra("widgetStart",false)){getIntent().removeExtra("widgetStart");notifyWeb("widgetStart",null);}else if(getIntent().getBooleanExtra("focus",false)){getIntent().removeExtra("focus");notifyWeb("focus",null);}}
    @Override protected void onResume() {
        super.onResume();
        applyAppearance();
        if(web!=null){web.onResume();notifyWeb("resume",null);notifyWeb("appearance",null);syncService();}
    }
    @Override protected void onPause() { if(web!=null)web.onPause();super.onPause(); }
    @Override public void onConfigurationChanged(android.content.res.Configuration config){super.onConfigurationChanged(config);applyAppearance();notifyWeb("appearance",null);}
    private void applyAppearance(){if(web==null)return;boolean dark=(getResources().getConfiguration().uiMode&android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_YES;int color=dark?Color.rgb(17,28,22):Color.rgb(244,247,242);getWindow().setStatusBarColor(color);getWindow().setNavigationBarColor(color);web.setBackgroundColor(color);if(web.getParent() instanceof View)((View)web.getParent()).setBackgroundColor(color);web.getSettings().setTextZoom(Math.round(getResources().getConfiguration().fontScale*100));if(Build.VERSION.SDK_INT>=30&&getWindow().getInsetsController()!=null){int mask=android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;getWindow().getInsetsController().setSystemBarsAppearance(dark?0:mask,mask);}else{getWindow().getDecorView().setSystemUiVisibility(dark?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);}}
    @Override public void onBackPressed() {
        handleBack();
    }
    private void handleBack() {
        web.evaluateJavascript("window.Qingzhou ? window.Qingzhou.back() : false", result -> {
            if (!"true".equals(result)) moveTaskToBack(true);
        });
    }
    private void notifyWeb(String event, String data) {
        if(web==null)return;
        runOnUiThread(() -> web.evaluateJavascript("window.Qingzhou && window.Qingzhou.nativeEvent("
            +JSONObject.quote(event)+","+(data==null?"null":JSONObject.quote(data))+");",null));
    }
    private void syncService() {
        runOnUiThread(() -> {
            try {
                String raw=DataStore.read(this);
                JSONObject state=raw==null?null:new JSONObject(raw);
                boolean hasTimer=state!=null && !state.isNull("timer");
                if(hasTimer) {
                    if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED
                        && !getPreferences(MODE_PRIVATE).getBoolean("notificationAsked",false)) {
                        getPreferences(MODE_PRIVATE).edit().putBoolean("notificationAsked",true).apply();
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFY);
                    }
                    startForegroundService(new Intent(this, FocusService.class));
                } else stopService(new Intent(this, FocusService.class));
            } catch(Exception error) { notifyWeb("serviceError","后台提醒暂不可用，返回应用后将按时间校准。"); }
        });
    }
    public final class Bridge {
        @JavascriptInterface public String readState() {
            // A Java String null becomes JS undefined in WebView. Always return a non-null envelope.
            try {
                String raw=DataStore.read(MainActivity.this);
                return new JSONObject().put("ok",true).put("exists",raw!=null)
                    .put("raw",raw==null?JSONObject.NULL:raw).toString();
            } catch(Exception error) {
                return "{\"ok\":false,\"message\":\"读取本机记录失败，请关闭应用后重试。\"}";
            }
        }
        @JavascriptInterface public String saveState(String value,String expected,String reason) {
            try {
                if(FocusController.pending(MainActivity.this)!=null)throw new IllegalStateException("请先重试保存上一轮专注结果。");
                if(!java.util.Arrays.asList("daily","import","restore","default").contains(reason))reason="daily";
                DataStore.write(MainActivity.this,value,expected,reason);
                syncService();
                return "{\"ok\":true}";
            } catch(Exception error) {
                try {return new JSONObject().put("ok",false).put("message",error.getMessage()).toString();}
                catch(Exception ignored){return "{\"ok\":false}";}
            }
        }
        @JavascriptInterface public String focusCommand(String command){try{FocusController.command(MainActivity.this,new JSONObject(command));syncService();return "{\"ok\":true}";}catch(Exception e){return failure(e);}}
        @JavascriptInterface public String pendingFocus(){try{JSONObject pending=FocusController.pending(MainActivity.this);return new JSONObject().put("ok",true).put("pending",pending==null?JSONObject.NULL:pending).toString();}catch(Exception e){return failure(e);}}
        @JavascriptInterface public long stateRevision(){return DataStore.revision(MainActivity.this);}
        @JavascriptInterface public String recoveryList(){try{return new JSONObject().put("ok",true).put("items",RecoveryStore.list(MainActivity.this)).toString();}catch(Exception e){return failure(e);}}
        @JavascriptInterface public String recoveryRead(String id){try{return new JSONObject().put("ok",true).put("raw",RecoveryStore.read(MainActivity.this,id)).toString();}catch(Exception e){return failure(e);}}
        @JavascriptInterface public boolean reducedMotion(){return android.provider.Settings.Global.getFloat(getContentResolver(),android.provider.Settings.Global.ANIMATOR_DURATION_SCALE,1f)==0f;}
        @JavascriptInterface public boolean darkMode(){return (getResources().getConfiguration().uiMode&android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_YES;}
        @JavascriptInterface public boolean isDebugBuild(){return BuildConfig.DEBUG;}
        private String failure(Exception e){try{return new JSONObject().put("ok",false).put("message",e.getMessage()==null?"操作失败，请重试。":e.getMessage()).toString();}catch(Exception ignored){return "{\"ok\":false,\"message\":\"操作失败\"}";}}
        @JavascriptInterface public void exportBackup(String value) {
            if(value==null || value.getBytes(StandardCharsets.UTF_8).length>DataStore.LIMIT) {
                notifyWeb("error","导出内容超过 30 MiB。");return;
            }
            runOnUiThread(() -> {
                pendingExport=value;
                try {
                    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json")
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .putExtra(Intent.EXTRA_TITLE,"轻舟学习备份-"+new java.text.SimpleDateFormat("yyyyMMdd-HHmm",java.util.Locale.ROOT).format(new java.util.Date())+".json");
                    startActivityForResult(intent,EXPORT);
                } catch(Exception error){pendingExport=null;notifyWeb("error","未能打开文件保存界面。");}
            });
        }
        @JavascriptInterface public void importBackup() {
            runOnUiThread(() -> {
                try {startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),IMPORT);}
                catch(Exception error){notifyWeb("error","未能打开文件选择界面。");}
            });
        }
        @JavascriptInterface public void copyEmail() {
            runOnUiThread(() -> {
                ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("轻舟项目开发者","2024304827@aust.edu.cn"));
                notifyWeb("toast","邮箱已复制");
            });
        }
        @JavascriptInterface public void openContact() {
            runOnUiThread(() -> {
                try {startActivity(new Intent(Intent.ACTION_SENDTO,Uri.parse("mailto:2024304827@aust.edu.cn")));}
                catch(Exception error){notifyWeb("error","未找到邮件应用，可复制邮箱联系。");}
            });
        }
        @JavascriptInterface public void openReleases() {
            runOnUiThread(() -> {
                try {startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://github.com/Hforty/qingzhou-study-assistant/releases")));}
                catch(Exception error){notifyWeb("error","未能打开发布页面。");}
            });
        }
        @JavascriptInterface public String version() { return BuildConfig.VERSION_NAME; }
        @JavascriptInterface public void feedback() { runOnUiThread(() -> web.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)); }
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(result!=RESULT_OK || data==null) {if(request==EXPORT)pendingExport=null;return;}
        Uri uri=data.getData();
        if(uri==null)return;
        if(request==EXPORT) {
            final String value=pendingExport;pendingExport=null;if(value==null)return;
            new Thread(() -> {
                try(OutputStream out=getContentResolver().openOutputStream(uri)) {
                    if(out==null)throw new java.io.IOException();
                    out.write(value.getBytes(StandardCharsets.UTF_8));out.flush();
                    notifyWeb("toast","备份已导出");
                } catch(Exception error){notifyWeb("error","备份导出失败，请重试。");}
            },"qingzhou-export").start();
        } else if(request==IMPORT) {
            new Thread(() -> {
                try(InputStream in=getContentResolver().openInputStream(uri); ByteArrayOutputStream out=new ByteArrayOutputStream()) {
                    if(in==null)throw new java.io.IOException();
                    byte[] buffer=new byte[8192];int size;
                    while((size=in.read(buffer))!=-1){if(out.size()+size>DataStore.LIMIT)throw new java.io.IOException("备份超过 30 MiB。");out.write(buffer,0,size);}
                    notifyWeb("import",out.toString(StandardCharsets.UTF_8.name()));
                } catch(Exception error){notifyWeb("error",error.getMessage()==null?"读取备份失败。":error.getMessage());}
            },"qingzhou-import").start();
        }
    }
}
