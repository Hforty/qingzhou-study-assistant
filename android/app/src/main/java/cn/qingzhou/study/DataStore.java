package cn.qingzhou.study;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

final class DataStore {
    static final Object LOCK = new Object();
    static final String KEY = "qingzhou.android.v1";
    static final int LIMIT = 30 * 1024 * 1024;
    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("qingzhou.records", Context.MODE_PRIVATE);
    }
    static String read(Context context) { synchronized (LOCK) { return prefs(context).getString(KEY, null); } }
    static long revision(Context context){synchronized(LOCK){return prefs(context).getLong("recordRevision",0);}}
    static boolean valid(String raw) {
        try {
            JSONObject root = new JSONObject(raw);
            return (root.getInt("schemaVersion") == 1 || root.getInt("schemaVersion") == 2) && root.getJSONObject("settings") != null
                && root.getJSONArray("tasks") != null && root.getJSONArray("sessions") != null
                && root.getJSONArray("completions") != null && root.getJSONObject("progress") != null;
        } catch (Exception error) { return false; }
    }
    static boolean write(Context context, String raw, String expected) {
        return write(context,raw,expected,"daily");
    }
    static boolean write(Context context, String raw, String expected,String reason) {
        synchronized (LOCK) {
            if (raw == null || raw.getBytes(StandardCharsets.UTF_8).length > LIMIT-1024 || !valid(raw))
                throw new IllegalArgumentException("记录格式不正确或超过 30 MiB。");
            SharedPreferences data = prefs(context);
            if(BuildConfig.DEBUG&&data.getBoolean("debugFailWrites",false))throw new IllegalStateException("原生验收模拟：保存失败");
            String previous = data.getString(KEY, null);
            long previousRevision=data.getLong("recordRevision",0);
            String previousVersion=data.getString("recordAppVersion","1.0.x"),previousRecoveryDay=data.getString("recoveryDay","");
            if (!Objects.equals(previous, expected))
                throw new IllegalStateException("学习记录刚在后台更新，请重试本次操作。");
            String today=new java.text.SimpleDateFormat("yyyy-MM-dd",java.util.Locale.ROOT).format(new java.util.Date());
            boolean migrate=previous!=null&&valid(previous)&&newSchema(previous)!=newSchema(raw);
            boolean checkpoint=previous!=null&&valid(previous)&&(migrate||!today.equals(data.getString("recoveryDay",""))||java.util.Arrays.asList("import","restore","default").contains(reason));
            if(checkpoint)RecoveryStore.save(context,previous,migrate?"升级前":reason,data.getString("recordAppVersion","1.0.x"));
            boolean success = data.edit().putString(KEY, raw).putLong("recordRevision",previousRevision+1).putString("recordAppVersion",BuildConfig.VERSION_NAME).putString("recoveryDay",checkpoint?today:data.getString("recoveryDay","")).commit();
            if (success && Objects.equals(data.getString(KEY, null), raw)) {StudyWidget.updateAll(context);return true;}
            SharedPreferences.Editor rollback = data.edit();
            if (previous == null) rollback.remove(KEY); else rollback.putString(KEY, previous);
            rollback.putLong("recordRevision",previousRevision).putString("recordAppVersion",previousVersion).putString("recoveryDay",previousRecoveryDay);
            rollback.commit();
            throw new IllegalStateException("保存失败，原记录已保留，请重试。");
        }
    }
    private static int newSchema(String raw){try{return new JSONObject(raw).optInt("schemaVersion");}catch(Exception error){return 0;}}
}
