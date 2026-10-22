package cn.qingzhou.study;
import android.content.*;
public final class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){final PendingResult result=goAsync();Context app=context.getApplicationContext();String action=intent==null?"":intent.getAction(),key=intent==null?"":intent.getStringExtra("key");new Thread(()->{try{if("tick".equals(action)||"snooze".equals(action))ReminderManager.receive(app,action,key);else ReminderManager.sync(app);}finally{result.finish();}},"qingzhou-reminders").start();}
}
