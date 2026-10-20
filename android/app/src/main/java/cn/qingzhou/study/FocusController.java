package cn.qingzhou.study;

import android.content.Context;
import android.util.AtomicFile;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Single writer for UI, notification and widget timer commands. */
final class FocusController {
    private static JSONObject inMemoryPending;
    private static File pendingFile(Context c){return new File(c.getFilesDir(),"pending-focus.json");}
    static JSONObject pending(Context c)throws Exception{
        synchronized(DataStore.LOCK){
            if(inMemoryPending!=null)return new JSONObject(inMemoryPending.toString());
            File file=pendingFile(c);if(!file.exists()&&!new File(file.getPath()+".bak").exists())return null;
            JSONObject p=new JSONObject(new String(new AtomicFile(file).readFully(),StandardCharsets.UTF_8));
            if(!p.has("id")||!p.has("remaining"))throw new IllegalStateException("待保存的计时结果无法读取，原文件已保留。");return p;
        }
    }
    private static void freeze(Context c,JSONObject p)throws Exception{
        inMemoryPending=p;p.put("persisted",false);
        try{p.put("persisted",true);RecoveryStore.atomic(pendingFile(c),p.toString());}
        catch(Exception error){p.put("persisted",false);throw new IllegalStateException("计时已冻结，但待保存结果也未能写入磁盘。请保持应用打开并释放空间后重试。",error);}
    }
    private static void commitPending(Context c)throws Exception{
        JSONObject p=pending(c);if(p==null)return;
        String raw=DataStore.read(c);if(raw==null)throw new IllegalStateException("本机记录不存在，待保存结果已保留。");
        JSONObject state=new JSONObject(raw),timer=state.optJSONObject("timer");JSONArray sessions=state.getJSONArray("sessions");
        boolean exists=false;for(int i=0;i<sessions.length();i++)if(p.getString("id").equals(sessions.getJSONObject(i).optString("id")))exists=true;
        if(timer!=null&&!p.getString("id").equals(timer.optString("id")))throw new IllegalStateException("已有另一轮计时，请先核对待保存结果。");
        if(!exists&&!p.isNull("record"))sessions.put(p.getJSONObject("record"));
        if(timer!=null)state.put("timer",JSONObject.NULL);
        DataStore.write(c,state.toString(),raw,"focus");new AtomicFile(pendingFile(c)).delete();inMemoryPending=null;
    }
    static JSONObject command(Context c,JSONObject request)throws Exception{
        synchronized(DataStore.LOCK){
            String action=request.getString("action");if("retry".equals(action)){commitPending(c);return state(c);}
            if(pending(c)!=null)throw new IllegalStateException("请先重试保存上一轮专注结果。");
            String raw=DataStore.read(c);if(raw==null||!DataStore.valid(raw))throw new IllegalStateException("请先完成首次设置或恢复有效记录。");
            JSONObject state=new JSONObject(raw);if(!state.optBoolean("onboardingCompleted"))throw new IllegalStateException("请先完成首次设置。");
            JSONObject timer=state.optJSONObject("timer");long now=System.currentTimeMillis();
            if("start".equals(action)){
                if(timer!=null)return state;
                String subject=request.optString("subject","math"),track="";int duration=request.optInt("duration",1500);
                if(request.has("taskId")){
                    JSONObject task=null;JSONArray tasks=state.getJSONArray("tasks");for(int i=0;i<tasks.length();i++)if(request.getString("taskId").equals(tasks.getJSONObject(i).optString("id")))task=tasks.getJSONObject(i);
                    if(task==null||task.optBoolean("done")||task.optBoolean("suspended")||task.optBoolean("queued"))throw new IllegalStateException("任务已变化，请重新选择。");
                    subject=task.getString("subject");track=task.optString("examTrack","");
                }
                if(!java.util.Arrays.asList("math","linear","math1extra","probability","english","english1extra","ds","co","os","net","politics").contains(subject)||duration!=1500&&duration!=3000&&duration!=5400)throw new IllegalArgumentException("专注课程或时长无效。");
                JSONObject settings=state.getJSONObject("settings");if(track.isEmpty()){if(subject.startsWith("english"))track=settings.optString("englishExam");else if(java.util.Arrays.asList("math","linear","math1extra","probability").contains(subject))track=settings.optString("mathExam");}
                timer=new JSONObject().put("id","focus-"+UUID.randomUUID()).put("subject",subject).put("duration",duration).put("remaining",duration).put("running",true).put("until",now+duration*1000L).put("date",new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(new Date(now)));
                if(!track.isEmpty())timer.put("examTrack",track);state.put("timer",timer);DataStore.write(c,state.toString(),raw,"focus");return state;
            }
            if(timer==null)return state;
            if(request.has("id")&&!timer.optString("id").equals(request.getString("id")))throw new IllegalStateException("计时已变化，请刷新后重试。");
            boolean running=timer.optBoolean("running");int duration=timer.getInt("duration"),remaining=timer.getInt("remaining");
            if(running)remaining=(int)Math.max(0,Math.min(duration,(timer.optLong("until")-now+999)/1000));
            if("cancel".equals(action)){state.put("timer",JSONObject.NULL);DataStore.write(c,state.toString(),raw,"focus");return state;}
            if(remaining==0||"end".equals(action)){
                int seconds=duration-remaining;JSONObject record=null;
                if(seconds>0){record=new JSONObject().put("id",timer.getString("id")).put("date",timer.getString("date")).put("subject",timer.getString("subject")).put("seconds",seconds).put("early",remaining>0).put("source","timer");if(timer.has("examTrack"))record.put("examTrack",timer.getString("examTrack"));}
                JSONObject p=new JSONObject().put("id",timer.getString("id")).put("remaining",remaining).put("record",record==null?JSONObject.NULL:record);
                freeze(c,p);commitPending(c);return state(c);
            }
            if("finish".equals(action))return state;
            if("pause".equals(action)&&running||"toggle".equals(action)&&running)timer.put("remaining",remaining).put("running",false).put("until",0);
            else if("resume".equals(action)&&!running||"toggle".equals(action)&&!running)timer.put("remaining",remaining).put("running",true).put("until",now+remaining*1000L);
            else if(!"pause".equals(action)&&!"resume".equals(action))throw new IllegalArgumentException("未知计时操作");
            DataStore.write(c,state.toString(),raw,"focus");return state;
        }
    }
    private static JSONObject state(Context c)throws Exception{return new JSONObject(DataStore.read(c));}
    static String course(JSONObject item){String subject=item.optString("subject"),track=item.optString("examTrack");switch(subject){case "math":return "高等数学";case "linear":return "线性代数";case "math1extra":return "数学一高数拓展";case "probability":return "概率论与数理统计";case "english":return "english1".equals(track)?"英语一":"english2".equals(track)?"英语二":"英语";case "english1extra":return "英语一专项";case "ds":return "数据结构";case "co":return "计算机组成原理";case "os":return "操作系统";case "net":return "计算机网络";default:return "思想政治理论";}}
}
