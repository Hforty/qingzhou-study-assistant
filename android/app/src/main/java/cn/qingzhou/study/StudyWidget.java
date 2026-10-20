package cn.qingzhou.study;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

public class StudyWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context c,AppWidgetManager m,int[] ids){for(int id:ids)update(c,m,id);}
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options){update(c,m,id);}
    static void updateAll(Context c){try{AppWidgetManager m=AppWidgetManager.getInstance(c);for(int id:m.getAppWidgetIds(new ComponentName(c,StudyWidget.class)))update(c,m,id);}catch(Exception ignored){}}
    private static void update(Context c,AppWidgetManager manager,int id){
        RemoteViews view=new RemoteViews(c.getPackageName(),R.layout.widget_study);String title="把今天，学踏实",detail="完成首次设置，开始轻舟之旅",button="打开轻舟";
        boolean start=false;
        try{String raw=DataStore.read(c);JSONObject state=raw==null?null:new JSONObject(raw);
            if(state!=null&&state.optBoolean("onboardingCompleted")){
                String today=new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(new Date());JSONObject timer=state.optJSONObject("timer");
                if(timer!=null){title=FocusController.course(timer);detail=timer.optBoolean("running")?"本轮专注进行中":"本轮已暂停，按自己的节奏继续";button="返回专注";}
                else if(!today.equals(state.optString("lastProcessedDate"))){detail="打开轻舟，核对今天的安排";button="查看今日计划";}
                else{
                    JSONArray tasks=state.getJSONArray("tasks");JSONObject next=null;int done=0,total=0;
                    for(int i=0;i<tasks.length();i++){JSONObject t=tasks.getJSONObject(i);if(!today.equals(t.optString("date"))||t.optBoolean("queued")||t.optBoolean("suspended"))continue;total++;if(t.optBoolean("done"))done++;else if(next==null)next=t;}
                    if(next!=null){title=next.optString("title");detail=FocusController.course(next)+" · "+next.optInt("minutes")+"分钟  |  今日 "+done+" / "+total;button="开始专注";start=true;}
                    else{title=total>0?"今天的安排已完成":"今天，留一点从容";detail=total>0?"已完成 "+done+" 项，辛苦了":"打开轻舟安排今天，或安心休息";button="查看轻舟";}
                }
            }
        }catch(Exception error){title="先保护好你的记录";detail="打开轻舟核对本机记录";}
        view.setTextViewText(R.id.widget_title,title);view.setTextViewText(R.id.widget_detail,detail);view.setTextViewText(R.id.widget_start,button);
        Intent intent=new Intent(c,MainActivity.class).putExtra("widgetStart",start).putExtra("focus",!start&&"返回专注".equals(button)).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open=PendingIntent.getActivity(c,1000+id,intent,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        view.setOnClickPendingIntent(R.id.widget_start,open);view.setOnClickPendingIntent(R.id.widget_root,open);manager.updateAppWidget(id,view);
    }
}
