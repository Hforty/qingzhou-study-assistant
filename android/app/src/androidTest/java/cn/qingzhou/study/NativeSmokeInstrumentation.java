package cn.qingzhou.study;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.WebView;
import android.view.View;
import android.view.ViewGroup;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Runs against a real Android WebView and real private storage, isolated in .debug. No mock bridge. */
public final class NativeSmokeInstrumentation extends Instrumentation {
    private Activity activity;private WebView web;private Context target;private final JSONArray checks=new JSONArray();
    private interface Check {void run()throws Exception;}
    @Override public void onCreate(Bundle args){super.onCreate(args);start();}
    @Override public void onStart(){Bundle result=new Bundle();try{
        target=getTargetContext();if(!target.getPackageName().endsWith(".debug"))throw new IllegalStateException("拒绝在正式用户记录上执行验收。");
        target.getSharedPreferences("qingzhou.records",Context.MODE_PRIVATE).edit().clear().commit();
        if(android.os.Build.VERSION.SDK_INT>=33){try(android.os.ParcelFileDescriptor fd=getUiAutomation().executeShellCommand("pm grant "+target.getPackageName()+" android.permission.POST_NOTIFICATIONS")){} }
        open();
        check("real-webview-first-launch",()->{waitJS("!!document.querySelector('#onboarding-form')");require(Boolean.TRUE.equals(js("JSON.parse(QingzhouAndroid.readState()).exists===false")),"新用户记录不存在响应");});
        check("real-v1-to-v2-preservation",()->{
            close();String date=new java.text.SimpleDateFormat("yyyy-MM-dd",java.util.Locale.ROOT).format(new java.util.Date());
            JSONObject state=new JSONObject().put("schemaVersion",1).put("settings",new JSONObject().put("name","保留旧记录").put("examDate","2027-12-20").put("examDateMode","manual").put("dailyHours",4).put("mathExam","math2").put("englishExam","english2").put("politicsMode","light").put("studyDays",new JSONArray("[0,1,2,3,4,5,6]")))
                .put("tasks",new JSONArray()).put("completions",new JSONArray()).put("sessions",new JSONArray().put(new JSONObject().put("id","legacy-focus").put("date",date).put("subject","english").put("seconds",37).put("examTrack","english2"))).put("progress",new JSONObject().put("math-0-0",new JSONObject().put("level",2).put("updated",date))).put("pausedTopics",new JSONArray()).put("defaultWeek",JSONObject.NULL).put("timer",JSONObject.NULL).put("onboardingCompleted",true).put("lastProcessedDate",date).put("nextId",1);
            prefs().edit().putString("qingzhou.android.v1",state.toString()).commit();open();waitJS("!!document.querySelector('.bottom-nav')");
            require(Boolean.TRUE.equals(js("QingzhouTest.getState().sessions[0].seconds===37&&QingzhouTest.getState().progress['math-0-0'].level===2")),"旧学习事实保留");
            js("(QingzhouTest.getStore().update(s=>({...s,settings:{...s.settings,name:'原生验收'}})),QingzhouTest.reconcile(),true)");
            require(new JSONObject(prefs().getString("qingzhou.android.v1","")).getInt("schemaVersion")==2,"新格式成功落盘");
            require(((Number)js("JSON.parse(QingzhouAndroid.recoveryList()).items.length")).intValue()>0,"迁移前恢复点");
        });
        check("native-timer-pause-actual-seconds",()->{
            command("start");SystemClock.sleep(2200);command("pause");int remaining=new JSONObject(prefs().getString("qingzhou.android.v1","")).getJSONObject("timer").getInt("remaining");
            SystemClock.sleep(1200);command("resume");SystemClock.sleep(1100);command("end");
            JSONObject state=new JSONObject(prefs().getString("qingzhou.android.v1",""));JSONArray sessions=state.getJSONArray("sessions");JSONObject record=sessions.getJSONObject(sessions.length()-1);
            require(record.getInt("seconds")>=3&&record.getInt("seconds")<=5,"暂停时间不得计入");require(remaining>=1496&&remaining<=1498,"暂停剩余时间");require(state.isNull("timer"),"计时结束");
        });
        check("pending-finish-survives-activity-reopen",()->{
            command("start");SystemClock.sleep(1200);prefs().edit().putBoolean("debugFailWrites",true).commit();
            require(Boolean.FALSE.equals(js("JSON.parse(QingzhouAndroid.focusCommand('{\"action\":\"end\"}')).ok")),"模拟写失败");
            JSONObject pending=new JSONObject((String)js("JSON.stringify(JSON.parse(QingzhouAndroid.pendingFocus()).pending)"));require(pending.getBoolean("persisted"),"待保存结果已落盘");int seconds=pending.getJSONObject("record").getInt("seconds");String id=pending.getString("id");
            close();open();SystemClock.sleep(1500);prefs().edit().putBoolean("debugFailWrites",false).commit();
            js("JSON.parse(QingzhouAndroid.focusCommand('{\"action\":\"retry\"}')).ok");js("JSON.parse(QingzhouAndroid.focusCommand('{\"action\":\"retry\"}')).ok");
            JSONArray sessions=new JSONObject(prefs().getString("qingzhou.android.v1","")).getJSONArray("sessions");int count=0;for(int i=0;i<sessions.length();i++)if(id.equals(sessions.getJSONObject(i).getString("id"))){count++;require(sessions.getJSONObject(i).getInt("seconds")==seconds,"重试不增加时长");}require(count==1,"重试不重复记账");
            js("QingzhouTest.reconcile()");
        });
        check("native-recovery-retains-five-verified-points",()->{
            for(int i=0;i<7;i++)js("(QingzhouTest.getStore().load(),QingzhouTest.getStore().save({...QingzhouTest.getStore().state,settings:{...QingzhouTest.getStore().state.settings,name:'恢复点"+i+"'}},QingzhouTest.getStore().raw,'import'),true)");
            require(((Number)js("JSON.parse(QingzhouAndroid.recoveryList()).items.length")).intValue()==5,"最多保留五份");
            require(Boolean.FALSE.equals(js("JSON.parse(QingzhouAndroid.recoveryRead('../other')).ok")),"拒绝异常路径");
        });
        check("corruption-ui-never-overwrites-and-can-recover",()->{
            close();prefs().edit().putString("qingzhou.android.v1","{broken").commit();open();waitJS("!!document.querySelector('.recovery')");require("{broken".equals(prefs().getString("qingzhou.android.v1","")),"损坏原文保留");
            js("document.querySelector('[data-action=recovery-list]').click()");waitJS("!!document.querySelector('[data-recovery]')");js("document.querySelector('[data-recovery]').click()");waitJS("!!document.querySelector('dialog .confirm')");js("document.querySelector('dialog .confirm').click()");waitJS("!!document.querySelector('.bottom-nav')");
            require(new JSONObject(prefs().getString("qingzhou.android.v1","")).getJSONArray("sessions").length()>0,"恢复学习记录");
        });
        check("widget-intent-starts-one-shared-timer",()->{
            String date=new java.text.SimpleDateFormat("yyyy-MM-dd",java.util.Locale.ROOT).format(new java.util.Date());
            js("(QingzhouTest.getStore().update(s=>({...s,lastProcessedDate:'"+date+"',tasks:[...s.tasks,{id:'widget-task',subject:'math',title:'组件验收',date:'"+date+"',minutes:20,kind:'learn',origin:'manual',done:false}]})),QingzhouTest.reconcile(),true)");
            Intent intent=intent().addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("widgetStart",true);target.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));waitJS("!!QingzhouTest.getState().timer");String id=new JSONObject(prefs().getString("qingzhou.android.v1","")).getJSONObject("timer").getString("id");
            target.startActivity(intent);SystemClock.sleep(600);require(id.equals(new JSONObject(prefs().getString("qingzhou.android.v1","")).getJSONObject("timer").getString("id")),"组件重复点击不重复开始");command("cancel");
        });
        check("native-custom-task-focus-and-rest-exclusion",()->{
            require(Boolean.TRUE.equals(js("JSON.parse(QingzhouAndroid.focusCommand(JSON.stringify({action:'start',subject:'math',taskId:'widget-task',duration:420}))).ok")),"自定义7分钟");
            JSONObject timer=new JSONObject(prefs().getString("qingzhou.android.v1","")).getJSONObject("timer");require("widget-task".equals(timer.getString("taskId")),"原生保留任务关联");SystemClock.sleep(1200);command("end");
            JSONObject before=new JSONObject(prefs().getString("qingzhou.android.v1",""));int count=before.getJSONArray("sessions").length();require("widget-task".equals(before.getJSONObject("lastFocusResult").getString("taskId")),"结束结果关联");
            require(Boolean.TRUE.equals(js("JSON.parse(QingzhouAndroid.focusCommand(JSON.stringify({action:'start',subject:'math',mode:'break',duration:60}))).ok")),"休息开始");SystemClock.sleep(1100);command("end");
            JSONObject after=new JSONObject(prefs().getString("qingzhou.android.v1",""));require(after.getJSONArray("sessions").length()==count,"休息不写学习记录");require("break".equals(after.getJSONObject("lastFocusResult").getString("mode")),"保留休息结束状态");
        });
        check("native-stopwatch-and-monotonic-deadline",()->{
            require(Boolean.TRUE.equals(js("JSON.parse(QingzhouAndroid.focusCommand(JSON.stringify({action:'start',subject:'math',mode:'stopwatch'}))).ok")),"正计时开始");SystemClock.sleep(1200);
            String raw=DataStore.read(target);JSONObject s=new JSONObject(raw);s.getJSONObject("timer").put("until",System.currentTimeMillis()-3600000);DataStore.write(target,s.toString(),raw);command("finish");
            require(!new JSONObject(DataStore.read(target)).isNull("timer"),"墙上时间变化不使正计时提前结束");command("pause");SystemClock.sleep(1100);command("resume");SystemClock.sleep(1100);command("end");
            JSONObject focusResult=new JSONObject(DataStore.read(target)).getJSONObject("lastFocusResult");require("stopwatch".equals(focusResult.getString("mode")),"正计时模式");require(focusResult.getInt("seconds")>=2&&focusResult.getInt("seconds")<=5,"正计时排除暂停");
        });
        check("native-reminder-schedules-and-completion-cancels",()->{
            String tomorrow=new java.text.SimpleDateFormat("yyyy-MM-dd",java.util.Locale.ROOT).format(new java.util.Date(System.currentTimeMillis()+86400000));
            js("(QingzhouTest.getStore().update(s=>({...s,reminders:[],todos:[],taskReminders:{'notify-task':'12:00'},tasks:[...s.tasks,{id:'notify-task',subject:'math',title:'通知验收',date:'"+tomorrow+"',minutes:20,kind:'learn',origin:'manual',done:false}]})),true)");
            require(ReminderManager.prefs(target).getLong("nextAt",0)>System.currentTimeMillis(),"系统已安排下一提醒");
            js("(QingzhouTest.getStore().update(s=>({...s,tasks:s.tasks.map(t=>t.id==='notify-task'?{...t,done:true}:t)})),true)");
            require(ReminderManager.prefs(target).getLong("nextAt",-1)==0,"完成任务取消最后一条提醒");
            require(Boolean.TRUE.equals(js("JSON.parse(QingzhouAndroid.notificationStatus()).ok")),"真实通知能力查询");
        });
        check("native-reminder-notify-dedup-and-snooze-invalidation",()->{
            long now=System.currentTimeMillis();String date=ReminderManager.day(now),time=new java.text.SimpleDateFormat("HH:mm",java.util.Locale.ROOT).format(new java.util.Date(now));long occurrence=ReminderManager.at(date,time);
            String raw=DataStore.read(target);JSONObject s=new JSONObject(raw);JSONArray todos=new JSONArray().put(new JSONObject().put("id","notify-todo").put("title","通知去重验收").put("date",date).put("done",false).put("remindTime",time));s.put("todos",todos);DataStore.write(target,s.toString(),raw);ReminderManager.prefs(target).edit().putLong("nextAt",occurrence).putString("seen","{}").commit();
            ReminderManager.receive(target,"tick","");String key="todo:notify-todo:"+occurrence;JSONObject active=new JSONObject(ReminderManager.prefs(target).getString("active","{}"));require(active.has(key),"真实系统通知已发布");
            ReminderManager.receive(target,"tick","");require(new JSONObject(ReminderManager.prefs(target).getString("active","{}")).length()==active.length(),"重复接收不增加通知");
            ReminderManager.receive(target,"snooze",key);require(new JSONObject(ReminderManager.prefs(target).getString("snoozes","{}")).has(key),"稍后提醒已持久保存");
            raw=DataStore.read(target);s=new JSONObject(raw);s.getJSONArray("todos").getJSONObject(0).put("done",true);DataStore.write(target,s.toString(),raw);require(new JSONObject(ReminderManager.prefs(target).getString("snoozes","{}")).length()==0,"完成事项后稍后提醒同步取消");
        });
        result.putString("stream","\nOK ("+checks.length()+" native WebView checks)\n");result.putString("checks",checks.toString());finish(Activity.RESULT_OK,result);
    }catch(Throwable error){result.putString("stream","\nFAILURE: "+android.util.Log.getStackTraceString(error));result.putString("checks",checks.toString());finish(Activity.RESULT_CANCELED,result);}finally{if(target!=null)prefs().edit().remove("debugFailWrites").commit();}}
    private SharedPreferences prefs(){return target.getSharedPreferences("qingzhou.records",Context.MODE_PRIVATE);}
    private Intent intent(){return new Intent().setClassName(target.getPackageName(),"cn.qingzhou.study.MainActivity");}
    private void open()throws Exception{activity=startActivitySync(intent().addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));runOnMainSync(()->web=findWeb(activity.getWindow().getDecorView()));if(web==null)throw new AssertionError("没有原生 WebView");waitJS("!!window.QingzhouTest");}
    private void close(){if(activity!=null)runOnMainSync(()->activity.finish());activity=null;waitForIdleSync();}
    private WebView findWeb(View v){if(v instanceof WebView)return(WebView)v;if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){WebView found=findWeb(g.getChildAt(i));if(found!=null)return found;}}return null;}
    private Object js(String expression)throws Exception{
        AtomicReference<String> output=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
        String script="(()=>{try{return JSON.stringify({ok:true,value:("+expression+")})}catch(e){return JSON.stringify({ok:false,error:String(e)})}})()";
        runOnMainSync(()->web.evaluateJavascript(script,value->{output.set(value);done.countDown();}));if(!done.await(15,TimeUnit.SECONDS))throw new AssertionError("WebView 调用超时");
        Object outer=new JSONTokener(output.get()).nextValue();if(!(outer instanceof String))throw new AssertionError("没有 JS 响应: "+output.get());JSONObject reply=new JSONObject((String)outer);if(!reply.getBoolean("ok"))throw new AssertionError(reply.optString("error"));return reply.opt("value");
    }
    private void command(String action)throws Exception{require(Boolean.TRUE.equals(js("JSON.parse(QingzhouAndroid.focusCommand(JSON.stringify({action:'"+action+"',subject:'math',duration:1500}))).ok")),"原生计时 "+action);}
    private void waitJS(String expression)throws Exception{long until=SystemClock.uptimeMillis()+15000;while(SystemClock.uptimeMillis()<until){try{if(Boolean.TRUE.equals(js(expression)))return;}catch(Throwable ignored){}SystemClock.sleep(100);}throw new AssertionError("等待失败: "+expression);}
    private void check(String name,Check check)throws Exception{check.run();checks.put(name);Bundle progress=new Bundle();progress.putString("stream","PASS "+name+"\n");sendStatus(0,progress);}
    private static void require(boolean condition,String message){if(!condition)throw new AssertionError(message);}
}
