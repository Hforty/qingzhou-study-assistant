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
    static boolean valid(String raw) {
        try {
            JSONObject root = new JSONObject(raw);
            return root.getInt("schemaVersion") == 1 && root.getJSONObject("settings") != null
                && root.getJSONArray("tasks") != null && root.getJSONArray("sessions") != null
                && root.getJSONArray("completions") != null && root.getJSONObject("progress") != null;
        } catch (Exception error) { return false; }
    }
    static boolean write(Context context, String raw, String expected) {
        synchronized (LOCK) {
            if (raw == null || raw.getBytes(StandardCharsets.UTF_8).length > LIMIT || !valid(raw))
                throw new IllegalArgumentException("记录格式不正确或超过 30 MiB。");
            SharedPreferences data = prefs(context);
            String previous = data.getString(KEY, null);
            if (!Objects.equals(previous, expected))
                throw new IllegalStateException("学习记录刚在后台更新，请重试本次操作。");
            boolean success = data.edit().putString(KEY, raw).commit();
            if (success && Objects.equals(data.getString(KEY, null), raw)) return true;
            SharedPreferences.Editor rollback = data.edit();
            if (previous == null) rollback.remove(KEY); else rollback.putString(KEY, previous);
            rollback.commit();
            throw new IllegalStateException("保存失败，原记录已保留，请重试。");
        }
    }
}
