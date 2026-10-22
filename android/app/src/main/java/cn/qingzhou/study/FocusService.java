package cn.qingzhou.study;

import android.app.*;
import android.content.Intent;
import android.os.*;
import org.json.JSONObject;

public class FocusService extends Service {
    private static final int ONGOING=41,COMPLETE=42;
    private static final String CHANNEL="qingzhou-focus",FINISHED="qingzhou-finished";
    private HandlerThread thread;private Handler worker;private String shown="";
    private final Runnable tick=()->refresh(null);
    @Override public void onCreate(){super.onCreate();thread=new HandlerThread("qingzhou-timer");thread.start();worker=new Handler(thread.getLooper());NotificationManager manager=getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel(CHANNEL,"专注计时",NotificationManager.IMPORTANCE_LOW));manager.createNotificationChannel(new NotificationChannel(FINISHED,"专注结束",NotificationManager.IMPORTANCE_DEFAULT));}
    private PendingIntent activity(){return PendingIntent.getActivity(this,1,new Intent(this,MainActivity.class).putExtra("focus",true).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);}
    private PendingIntent action(String action,int id){return PendingIntent.getService(this,id,new Intent(this,FocusService.class).setAction(action),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);}
    private Notification notification(JSONObject t){
        boolean running=t.optBoolean("running"),rest="break".equals(t.optString("mode")),stopwatch="stopwatch".equals(t.optString("mode"));long now=System.currentTimeMillis();
        int left=t.optInt("remaining");if(running)left=(int)Math.max(0,Math.min(t.optInt("duration"),(t.optLong("until")-now+999)/1000));
        String title=rest?"轻舟 · 休息中":t.optString("taskTitle",FocusController.course(t));
        Notification.Builder b=new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle(title+" · "+(running?rest?"休息中":"专注中":"已暂停")).setContentText(rest?"休息不计入学习时间":FocusController.course(t)).setOngoing(true).setOnlyAlertOnce(true).setContentIntent(activity()).addAction(new Notification.Action.Builder(null,running?"暂停":"继续",action("toggle",2)).build()).addAction(new Notification.Action.Builder(null,"结束",action("end",3)).build());
        if(running)b.setWhen(stopwatch?now-(t.optInt("duration")-left)*1000L:t.optLong("until")).setUsesChronometer(true).setChronometerCountDown(!stopwatch);
        else {int display=stopwatch?t.optInt("duration")-left:left;b.setContentText((stopwatch?"已专注 ":"剩余 ")+(display/60)+" 分 "+(display%60)+" 秒");}
        return b.build();
    }
    @Override public int onStartCommand(Intent intent,int flags,int id){startForeground(ONGOING,new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle("轻舟专注").setContentText("正在核对计时").setContentIntent(activity()).build());worker.post(()->refresh(intent==null?null:intent.getAction()));return START_NOT_STICKY;}
    private void refresh(String action){worker.removeCallbacks(tick);try{
        JSONObject p=FocusController.pending(this);if(p!=null)FocusController.command(this,new JSONObject().put("action","retry"));
        String raw=DataStore.read(this);JSONObject state=raw==null?null:new JSONObject(raw),before=state==null?null:state.optJSONObject("timer");if(before==null){stop();return;}
        boolean expired=before.optBoolean("running")&&before.optLong("until")<=System.currentTimeMillis();
        state=FocusController.command(this,new JSONObject().put("action",action==null?"finish":action).put("id",before.getString("id")));
        JSONObject timer=state.optJSONObject("timer");if(timer==null){stop();return;}
        if(!timer.toString().equals(shown)){shown=timer.toString();getSystemService(NotificationManager.class).notify(ONGOING,notification(timer));}if(timer.optBoolean("running"))worker.postDelayed(tick,1000);
    }catch(Exception error){getSystemService(NotificationManager.class).notify(ONGOING,new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle("专注结果等待保存").setContentText("请打开轻舟核对并重试").setContentIntent(activity()).setOngoing(true).build());worker.postDelayed(tick,3000);}}
    private void stop(){worker.removeCallbacks(tick);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onDestroy(){if(worker!=null)worker.removeCallbacksAndMessages(null);if(thread!=null)thread.quitSafely();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
