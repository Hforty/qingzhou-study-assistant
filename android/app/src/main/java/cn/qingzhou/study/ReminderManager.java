package cn.qingzhou.study;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;

/** One persisted OS alarm for the next reminder or timer deadline. No polling service for reminders. */
final class ReminderManager {
    static final String CHANNEL="qingzhou-study-reminders",FINISHED="qingzhou-finished";
    private static final String STATE="reminderRuntime";
    static final class Event {
        String key,title,source,id,base;long at;
        JSONObject json() throws JSONException{return new JSONObject().put("key",key).put("title",title).put("source",source).put("id",id).put("base",base).put("at",at);}
        static Event parse(JSONObject j){Event e=new Event();e.key=j.optString("key");e.title=j.optString("title");e.source=j.optString("source");e.id=j.optString("id");e.base=j.optString("base");e.at=j.optLong("at");return e;}
    }
    static SharedPreferences prefs(Context c){return c.getSharedPreferences(STATE,Context.MODE_PRIVATE);}
    static void channels(Context c){NotificationManager n=c.getSystemService(NotificationManager.class);n.createNotificationChannel(new NotificationChannel(CHANNEL,"学习与任务提醒",NotificationManager.IMPORTANCE_DEFAULT));n.createNotificationChannel(new NotificationChannel(FINISHED,"专注与休息结束",NotificationManager.IMPORTANCE_DEFAULT));}
    static boolean allowed(Context c,String channel){
        NotificationManager n=c.getSystemService(NotificationManager.class);if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return false;
        NotificationChannel ch=n.getNotificationChannel(channel);return n.areNotificationsEnabled()&&(ch==null||ch.getImportance()!=NotificationManager.IMPORTANCE_NONE);
    }
    static boolean exact(Context c){return Build.VERSION.SDK_INT<31||c.getSystemService(AlarmManager.class).canScheduleExactAlarms();}
    static JSONObject status(Context c)throws JSONException{channels(c);return new JSONObject().put("ok",true).put("notifications",allowed(c,CHANNEL)).put("focusNotifications",allowed(c,FINISHED)).put("exact",exact(c)).put("asked",c.getSharedPreferences("qingzhou.notifications",Context.MODE_PRIVATE).getBoolean("notificationAsked",false)).put("nextAt",prefs(c).getLong("nextAt",0)).put("scheduleError",prefs(c).getString("scheduleError",""));}
    static String day(long stamp){return new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(new Date(stamp));}
    static long at(String day,String time){try{SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd HH:mm",Locale.ROOT);f.setLenient(false);return f.parse(day+" "+time).getTime();}catch(Exception e){return -1;}}
    private static Event event(String source,String id,String title,String date,String time){Event e=new Event();e.source=source;e.id=id;e.title=title;e.at=at(date,time);e.base=date+"|"+time+"|"+title;e.key=source+":"+id+":"+e.at;return e;}
    private static boolean has(JSONArray a,int value){if(a==null)return false;for(int i=0;i<a.length();i++)if(a.optInt(i,-1)==value)return true;return false;}
    private static JSONObject find(JSONArray a,String id){if(a==null)return null;for(int i=0;i<a.length();i++){JSONObject t=a.optJSONObject(i);if(t!=null&&id.equals(t.optString("id")))return t;}return null;}
    private static boolean available(JSONObject t){return t!=null&&!t.optBoolean("done")&&!t.optBoolean("queued")&&!t.optBoolean("suspended");}
    static List<Event> events(JSONObject state,long now){
        List<Event> result=new ArrayList<>();if(state==null||!state.optBoolean("onboardingCompleted"))return result;
        JSONArray reminders=state.optJSONArray("reminders");
        if(reminders!=null)for(int i=0;i<reminders.length();i++){JSONObject r=reminders.optJSONObject(i);if(r==null||!r.optBoolean("enabled"))continue;JSONArray days=r.optBoolean("followStudyDays")?state.optJSONObject("settings").optJSONArray("studyDays"):r.optJSONArray("days");
            Calendar calendar=Calendar.getInstance();calendar.setTimeInMillis(now);calendar.add(Calendar.DAY_OF_YEAR,-1);
            for(int d=0;d<10;d++,calendar.add(Calendar.DAY_OF_YEAR,1))if(has(days,calendar.get(Calendar.DAY_OF_WEEK)-1))result.add(event("repeat",r.optString("id"),r.optString("title"),day(calendar.getTimeInMillis()),r.optString("time")));
        }
        JSONObject times=state.optJSONObject("taskReminders");JSONArray tasks=state.optJSONArray("tasks");
        if(times!=null&&tasks!=null)for(int i=0;i<tasks.length();i++){JSONObject t=tasks.optJSONObject(i);if(available(t)){String time=times.optString(t.optString("id"),"");if(!time.isEmpty())result.add(event("task",t.optString("id"),t.optString("title"),t.optString("date"),time));}}
        JSONArray todos=state.optJSONArray("todos");if(todos!=null)for(int i=0;i<todos.length();i++){JSONObject t=todos.optJSONObject(i);if(available(t)&&!t.isNull("date")&&!t.isNull("remindTime")&&!t.optString("remindTime").isEmpty())result.add(event("todo",t.optString("id"),t.optString("title"),t.optString("date"),t.optString("remindTime")));}
        result.removeIf(e->e.at<0);return result;
    }
    private static JSONObject object(String raw){try{return new JSONObject(raw);}catch(Exception e){return new JSONObject();}}
    private static JSONObject state(Context c){String raw=DataStore.read(c);return raw!=null&&DataStore.valid(raw)?object(raw):null;}
    static boolean valid(JSONObject state,Event e){
        if(state==null||!state.optBoolean("onboardingCompleted"))return false;
        if("task".equals(e.source)){JSONObject t=find(state.optJSONArray("tasks"),e.id);String time=state.optJSONObject("taskReminders")==null?"":state.optJSONObject("taskReminders").optString(e.id);return available(t)&&e.base.equals(t.optString("date")+"|"+time+"|"+t.optString("title"));}
        if("todo".equals(e.source)){JSONObject t=find(state.optJSONArray("todos"),e.id);return available(t)&&e.base.equals(t.optString("date")+"|"+t.optString("remindTime")+"|"+t.optString("title"));}
        JSONObject r=find(state.optJSONArray("reminders"),e.id);if(r==null||!r.optBoolean("enabled"))return false;
        String date=e.base.length()>=10?e.base.substring(0,10):"";Calendar c=Calendar.getInstance();long occurrence=at(date,r.optString("time"));if(occurrence<0)return false;c.setTimeInMillis(occurrence);
        JSONArray days=r.optBoolean("followStudyDays")?state.optJSONObject("settings").optJSONArray("studyDays"):r.optJSONArray("days");return e.base.equals(date+"|"+r.optString("time")+"|"+r.optString("title"))&&has(days,c.get(Calendar.DAY_OF_WEEK)-1);
    }
    private static PendingIntent alarm(Context c){return PendingIntent.getBroadcast(c,91,new Intent(c,ReminderReceiver.class).setAction("tick"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static void sync(Context c){synchronized(DataStore.LOCK){
        try{channels(c);JSONObject state=state(c),snoozes=object(prefs(c).getString("snoozes","{}")),active=object(prefs(c).getString("active","{}"));long now=System.currentTimeMillis(),next=Long.MAX_VALUE,prior=prefs(c).getLong("nextAt",0);JSONObject seen=object(prefs(c).getString("seen","{}"));
            for(Event e:events(state,now))if(e.at>now||prior>0&&e.at>=prior-1000&&e.at>=now-6*3600000L&&!seen.has(e.key+":"+e.at))next=Math.min(next,e.at);
            for(String key:new ArrayList<>(keys(snoozes))){Event e=Event.parse(snoozes.getJSONObject(key));if(!valid(state,e)||e.at<now-6*3600000L)snoozes.remove(key);else next=Math.min(next,Math.max(now+500,e.at));}
            for(String key:new ArrayList<>(keys(active))){Event e=Event.parse(active.getJSONObject(key));if(!valid(state,e)||e.at<now-86400000L){c.getSystemService(NotificationManager.class).cancel(key,0);active.remove(key);}}
            JSONObject timer=state==null?null:state.optJSONObject("timer");if(timer!=null&&timer.optBoolean("running")&&FocusController.pending(c)==null)next=Math.min(next,FocusController.deadline(c,timer));
            AlarmManager manager=c.getSystemService(AlarmManager.class);PendingIntent alarm=alarm(c);
            if(next==Long.MAX_VALUE){manager.cancel(alarm);next=0;}else{
                boolean precise=exact(c);try{if(precise)manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,Math.max(now+500,next),alarm);else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,Math.max(now+500,next),alarm);}catch(SecurityException denied){manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,Math.max(now+500,next),alarm);}
            }
            if(!prefs(c).edit().putLong("nextAt",next).putString("active",active.toString()).putString("snoozes",snoozes.toString()).putString("scheduleError","").commit())throw new IllegalStateException("提醒状态未能保存");
        }catch(Exception error){prefs(c).edit().putString("scheduleError","提醒未能安排，请打开应用重试并检查系统设置。").commit();}
    }}
    private static List<String> keys(JSONObject j){List<String> list=new ArrayList<>();j.keys().forEachRemaining(list::add);return list;}
    static PendingIntent open(Context c,Event e,boolean start){Intent i=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP).setData(Uri.parse("qingzhou://reminder/"+Uri.encode(e.key)+(start?"/start":"/open"))).putExtra("reminderSource",e.source).putExtra("reminderId",e.id).putExtra("reminderStart",start);return PendingIntent.getActivity(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private static void post(Context c,Event e){if(!allowed(c,CHANNEL))return;Intent later=new Intent(c,ReminderReceiver.class).setAction("snooze").setData(Uri.parse("qingzhou://snooze/"+Uri.encode(e.key))).putExtra("key",e.key);
        Notification.Builder n=new Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle(e.title).setContentText("todo".equals(e.source)?"到约定的时间了，看看这件事吧。":"给眼前的学习留一点时间吧。").setAutoCancel(true).setContentIntent(open(c,e,false));
        if(!"todo".equals(e.source))n.addAction(new Notification.Action.Builder(null,"开始专注",open(c,e,true)).build());
        n.addAction(new Notification.Action.Builder(null,"10分钟后",PendingIntent.getBroadcast(c,0,later,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT)).build());c.getSystemService(NotificationManager.class).notify(e.key,0,n.build());
    }
    static void receive(Context c,String action,String key){synchronized(DataStore.LOCK){try{
        JSONObject state=state(c),seen=object(prefs(c).getString("seen","{}")),active=object(prefs(c).getString("active","{}")),snoozes=object(prefs(c).getString("snoozes","{}"));long now=System.currentTimeMillis(),from=prefs(c).getLong("nextAt",now);
        if("snooze".equals(action)){JSONObject entry=active.optJSONObject(key);if(entry!=null){Event e=Event.parse(entry);if(valid(state,e)){e.at=now+600000;snoozes.put(e.key,e.json());}active.remove(key);c.getSystemService(NotificationManager.class).cancel(key,0);}}
        else{
            List<Event> due=events(state,now);for(String id:keys(snoozes))due.add(Event.parse(snoozes.getJSONObject(id)));
            for(Event e:due)if(e.at>=Math.max(from-1000,now-6*3600000L)&&e.at<=now+500&&valid(state,e)&&!seen.has(e.key+":"+e.at)){
                if(allowed(c,CHANNEL)){post(c,e);active.put(e.key,e.json());}seen.put(e.key+":"+e.at,now);snoozes.remove(e.key);
            }
            for(String id:new ArrayList<>(keys(seen)))if(seen.optLong(id)<now-2*86400000L)seen.remove(id);
        }
        if(!prefs(c).edit().putString("seen",seen.toString()).putString("active",active.toString()).putString("snoozes",snoozes.toString()).commit())throw new IllegalStateException("提醒状态保存失败");
        JSONObject timer=state==null?null:state.optJSONObject("timer");if(timer!=null&&timer.optBoolean("running")&&FocusController.remaining(c,timer,now)==0)FocusController.command(c,new JSONObject().put("action","finish").put("id",timer.optString("id")));
    }catch(Exception error){prefs(c).edit().putString("scheduleError","提醒或计时结果等待重试，请打开轻舟核对。").commit();}finally{sync(c);}}}
    static void finished(Context c,JSONObject result){try{channels(c);if(!allowed(c,FINISHED))return;boolean rest="break".equals(result.optString("mode"));Intent i=new Intent(c,MainActivity.class).putExtra("focus",true).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);Notification n=new Notification.Builder(c,FINISHED).setSmallIcon(R.drawable.ic_notification).setContentTitle(rest?"休息结束，慢慢回到节奏":"本轮专注完成").setContentText(rest?"准备好后，再开始下一轮。":"已记录实际学习时间，起身活动一下吧。").setAutoCancel(true).setContentIntent(PendingIntent.getActivity(c,42,i,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT)).build();c.getSystemService(NotificationManager.class).notify("qingzhou-focus-result",42,n);}catch(Exception ignored){}}
    static void test(Context c){channels(c);if(!allowed(c,CHANNEL))throw new IllegalStateException("请先开启学习提醒通知。");c.getSystemService(NotificationManager.class).notify("reminder-test",0,new Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle("轻舟提醒已就绪").setContentText("这是一条测试通知，声音和振动遵循手机设置。").setAutoCancel(true).setContentIntent(PendingIntent.getActivity(c,43,new Intent(c,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT)).build());}
}
