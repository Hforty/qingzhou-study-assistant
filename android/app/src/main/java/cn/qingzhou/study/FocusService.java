package cn.qingzhou.study;

import android.app.Service;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;

public class FocusService extends Service {
    private static final int ONGOING=41, COMPLETE=42;
    private static final String CHANNEL="qingzhou-focus", FINISHED="qingzhou-finished";
    private final Handler handler=new Handler(Looper.getMainLooper());
    private String shownId="";
    private JSONObject pendingRecord;
    private String pendingTimerId;
    private final Runnable tick=new Runnable(){@Override public void run(){refresh(null);}};
    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager=getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL,"专注计时",NotificationManager.IMPORTANCE_LOW));
        manager.createNotificationChannel(new NotificationChannel(FINISHED,"专注结束",NotificationManager.IMPORTANCE_DEFAULT));
    }
    private PendingIntent activity() {
        return PendingIntent.getActivity(this,1,new Intent(this,MainActivity.class).putExtra("focus",true).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
    }
    private PendingIntent action(String value,int code) {
        return PendingIntent.getService(this,code,new Intent(this,FocusService.class).setAction(value),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
    }
    private String course(JSONObject timer) {
        String id=timer.optString("subject");
        switch(id){
            case "math": return "高等数学";case "linear":return "线性代数";case "math1extra":return "数学一高数拓展";case "probability":return "概率论与数理统计";
            case "english":return "english1".equals(timer.optString("examTrack"))?"英语一":"英语二";case "english1extra":return "英语一专项";
            case "ds":return "数据结构";case "co":return "计算机组成原理";case "os":return "操作系统";case "net":return "计算机网络";default:return "思想政治理论";
        }
    }
    private Notification notification(JSONObject timer) {
        boolean running=timer.optBoolean("running");
        Notification.Builder b=new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(course(timer)+" · "+(running?"专注中":"已暂停")).setContentText(running?"专心眼前这一件事":"准备好后继续")
            .setContentIntent(activity()).setOngoing(true).setOnlyAlertOnce(true)
            .addAction(new Notification.Action.Builder(null,running?"暂停":"继续",action("toggle",2)).build())
            .addAction(new Notification.Action.Builder(null,"结束",action("end",3)).build());
        if(running)b.setWhen(timer.optLong("until")).setUsesChronometer(true).setChronometerCountDown(true);
        else b.setContentText("剩余 "+(timer.optInt("remaining")/60)+" 分钟");
        return b.build();
    }
    @Override public int onStartCommand(Intent intent,int flags,int id) {
        // Required immediately after startForegroundService, including a concurrent timer removal.
        startForeground(ONGOING,new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("轻舟专注").setContentText("正在核对计时").setContentIntent(activity()).build());
        shownId="";
        refresh(intent==null?null:intent.getAction());
        return START_NOT_STICKY;
    }
    private void refresh(String action) {
        handler.removeCallbacks(tick);
        try {
            synchronized(DataStore.LOCK) {
                String raw=DataStore.read(this);
                if(raw==null){stop();return;}
                JSONObject state=new JSONObject(raw),timer=state.optJSONObject("timer");
                if(pendingTimerId!=null){
                    JSONArray sessions=state.getJSONArray("sessions");boolean exists=false;
                    for(int i=0;i<sessions.length();i++)if(pendingTimerId.equals(sessions.getJSONObject(i).optString("id")))exists=true;
                    if(!exists&&pendingRecord!=null)sessions.put(pendingRecord);
                    if(timer!=null&&pendingTimerId.equals(timer.optString("id")))state.put("timer",JSONObject.NULL);
                    DataStore.write(this,state.toString(),raw);pendingTimerId=null;pendingRecord=null;
                    timer=state.optJSONObject("timer");
                }
                if(timer==null){stop();return;}
                boolean running=timer.optBoolean("running");
                long now=System.currentTimeMillis();
                int duration=timer.getInt("duration"),remaining=timer.getInt("remaining");
                if(running)remaining=(int)Math.max(0,Math.min(duration,(timer.optLong("until")-now+999)/1000));
                boolean ended=remaining==0 || "end".equals(action);
                if(ended) {
                    int seconds=duration-remaining;String timerId=timer.getString("id");
                    JSONArray sessions=state.getJSONArray("sessions");boolean exists=false;
                    for(int i=0;i<sessions.length();i++)if(timerId.equals(sessions.getJSONObject(i).optString("id")))exists=true;
                    if(seconds>0&&!exists){
                        JSONObject record=new JSONObject().put("id",timerId).put("date",timer.getString("date")).put("subject",timer.getString("subject"))
                            .put("seconds",seconds).put("early",remaining>0);
                        if(timer.has("examTrack"))record.put("examTrack",timer.getString("examTrack"));
                        sessions.put(record);
                        pendingRecord=record;
                    }
                    pendingTimerId=timerId;
                    state.put("timer",JSONObject.NULL);
                    DataStore.write(this,state.toString(),raw);
                    pendingTimerId=null;pendingRecord=null;
                    if(remaining==0)getSystemService(NotificationManager.class).notify(COMPLETE,
                        new Notification.Builder(this,FINISHED).setSmallIcon(R.drawable.ic_notification).setContentTitle("本轮专注完成")
                            .setContentText(course(timer)+" · 辛苦了，起身活动一下吧。").setContentIntent(activity()).setAutoCancel(true).build());
                    stop();return;
                }
                if("toggle".equals(action)) {
                    timer.put("remaining",remaining).put("running",!running).put("until",running?0:now+remaining*1000L);
                    DataStore.write(this,state.toString(),raw);
                    shownId="";
                }
                String key=timer.toString();
                if(!key.equals(shownId)){getSystemService(NotificationManager.class).notify(ONGOING,notification(timer));shownId=key;}
                if(timer.optBoolean("running"))handler.postDelayed(tick,1000);
            }
        } catch(Exception error) {
            // Preserve the full timer and its original date on failed writes; retry without duplicate sessions.
            handler.postDelayed(tick,3000);
        }
    }
    private void stop(){handler.removeCallbacks(tick);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onDestroy(){handler.removeCallbacks(tick);super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
