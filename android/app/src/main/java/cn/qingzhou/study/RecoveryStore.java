package cn.qingzhou.study;

import android.content.Context;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Comparator;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Valid original records only. No recovery file is used as an empty default. */
final class RecoveryStore {
    private static File directory(Context c){return new File(c.getFilesDir(),"recovery");}
    private static File[] files(Context c){File[] list=directory(c).listFiles((d,n)->n.matches("[a-f0-9-]{36}\\.json"));if(list==null)return new File[0];Arrays.sort(list,Comparator.comparingLong(File::lastModified).reversed());return list;}
    static void atomic(File file,String text)throws Exception{
        AtomicFile out=new AtomicFile(file);FileOutputStream stream=null;
        try{stream=out.startWrite();stream.write(text.getBytes(StandardCharsets.UTF_8));out.finishWrite(stream);}
        catch(Exception e){out.failWrite(stream);throw e;}
    }
    private static JSONObject parse(File file)throws Exception{return new JSONObject(new String(new AtomicFile(file).readFully(),StandardCharsets.UTF_8));}
    private static String hash(String raw)throws Exception{byte[] bytes=MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));StringBuilder b=new StringBuilder();for(byte value:bytes)b.append(String.format(java.util.Locale.ROOT,"%02x",value));return b.toString();}
    static void save(Context c,String raw,String reason,String version){
        synchronized(DataStore.LOCK){try{
            if(!DataStore.valid(raw))throw new IllegalStateException("原记录损坏，无法创建有效恢复点。");
            File dir=directory(c);if(!dir.isDirectory()&&!dir.mkdirs())throw new java.io.IOException("无法创建恢复目录");
            String digest=hash(raw);File[] old=files(c);
            if(old.length>0){try{if(digest.equals(parse(old[0]).optString("sha256")))return;}catch(Exception ignored){}}
            long createdAt=Math.max(System.currentTimeMillis(),old.length==0?0:old[0].lastModified()+1);
            String id=UUID.randomUUID().toString();JSONObject entry=new JSONObject().put("id",id).put("createdAt",createdAt).put("version",version).put("reason",reason).put("sha256",digest).put("raw",raw);
            File target=new File(dir,id+".json");atomic(target,entry.toString());
            JSONObject read=parse(target);if(!digest.equals(hash(read.getString("raw"))))throw new java.io.IOException("恢复点回读失败");
            if(!target.setLastModified(createdAt))throw new java.io.IOException("恢复点顺序核对失败");
            File[] current=files(c);for(int i=5;i<current.length;i++)new AtomicFile(current[i]).delete();
        }catch(Exception e){throw new IllegalStateException("无法保存自动恢复点，本次操作尚未执行。请释放存储空间后重试。",e);}}
    }
    static JSONArray list(Context c){synchronized(DataStore.LOCK){JSONArray result=new JSONArray();for(File file:files(c))try{
        JSONObject entry=parse(file);String raw=entry.getString("raw");if(!DataStore.valid(raw)||!entry.getString("sha256").equals(hash(raw)))continue;
        JSONObject state=new JSONObject(raw);entry.remove("raw");entry.put("tasks",state.getJSONArray("tasks").length()).put("sessions",state.getJSONArray("sessions").length());result.put(entry);
    }catch(Exception ignored){}return result;}}
    static String read(Context c,String id)throws Exception{synchronized(DataStore.LOCK){
        if(id==null||!id.matches("[a-f0-9-]{36}"))throw new IllegalArgumentException("恢复点编号无效");
        JSONObject entry=parse(new File(directory(c),id+".json"));String raw=entry.getString("raw");
        if(!DataStore.valid(raw)||!entry.getString("sha256").equals(hash(raw)))throw new IllegalStateException("恢复点未通过核对，未改动现有记录。");return raw;
    }}
}
