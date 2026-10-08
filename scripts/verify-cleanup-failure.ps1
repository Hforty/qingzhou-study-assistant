param([string]$Setup)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $env:TEMP 'qingzhou-v105-work'))
$install=Join-Path $taskRoot 'uninstall-check'
$data=Join-Path $env:APPDATA 'QingzhouStudy-Verification-v105'
$cache=Join-Path $env:LOCALAPPDATA 'qingzhou-study-verification-v105-updater'
if(!$Setup){$Setup=Join-Path $taskRoot 'isolated-1.0.5\Qingzhou-Verify-1.0.5.exe'}
if((Get-Item -LiteralPath $Setup).VersionInfo.ProductName -ne '轻舟升级验收'){throw 'Only isolated test installers are allowed'}
if((Test-Path -LiteralPath $install) -or (Test-Path -LiteralPath $data) -or (Test-Path -LiteralPath $cache)){throw 'Existing test directories will not be overwritten'}
Add-Type @'
using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;
public class QzWindow { public IntPtr Handle;public string Text;public string Class; }
public static class QzGui {
 public delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")]static extern bool EnumWindows(EnumProc f,IntPtr p);
 [DllImport("user32.dll")]static extern bool EnumChildWindows(IntPtr h,EnumProc f,IntPtr p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll")]public static extern IntPtr SendMessage(IntPtr h,int m,IntPtr w,IntPtr l);
 [DllImport("user32.dll")]public static extern bool PostMessage(IntPtr h,int m,IntPtr w,IntPtr l);
 [DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int w,int z,uint f);
 static QzWindow Info(IntPtr h){var t=new StringBuilder(1024);var c=new StringBuilder(128);GetWindowText(h,t,t.Capacity);GetClassName(h,c,c.Capacity);return new QzWindow{Handle=h,Text=t.ToString(),Class=c.ToString()};}
 public static QzWindow[] Top(){var a=new List<QzWindow>();EnumWindows((h,p)=>{a.Add(Info(h));return true;},IntPtr.Zero);return a.ToArray();}
 public static QzWindow[] Children(IntPtr w){var a=new List<QzWindow>();EnumChildWindows(w,(h,p)=>{a.Add(Info(h));return true;},IntPtr.Zero);return a.ToArray();}
 public static void Away(IntPtr h){SetWindowPos(h,IntPtr.Zero,-2200,-2200,0,0,0x15);}
 public static void Click(IntPtr h){PostMessage(h,0xF5,IntPtr.Zero,IntPtr.Zero);}
}
'@
$exe=Join-Path $install '轻舟升级验收.exe';$un=Join-Path $install 'Uninstall 轻舟升级验收.exe'
function WaitUntil([scriptblock]$check,[string]$reason){$end=[DateTime]::UtcNow.AddSeconds(50);do{if(& $check){return};Start-Sleep -Milliseconds 150}while([DateTime]::UtcNow -lt $end);throw $reason}
function InstallTest {Start-Process -FilePath $Setup -ArgumentList "/S /D=$install" -WindowStyle Hidden | Out-Null;WaitUntil {Test-Path -LiteralPath $un} 'Install timed out';Start-Sleep -Milliseconds 800}
function Seed {New-Item -ItemType Directory -Path $data,$cache -Force|Out-Null;Set-Content -LiteralPath (Join-Path $data 'record.txt') -Value 'keep';Set-Content -LiteralPath (Join-Path $cache 'cache.txt') -Value 'keep'}
function Dialog { @([QzGui]::Top() | Where-Object {$_.Class -eq '#32770' -and $_.Text -like '*轻舟升级验收*'}) | Select-Object -Last 1 }
function Buttons($w){@([QzGui]::Children($w.Handle) | Where-Object {$_.Class -eq 'Button'})}
function Welcome([string]$flags=''){
 if($flags){Start-Process -FilePath $un -ArgumentList $flags -WindowStyle Hidden|Out-Null}else{Start-Process -FilePath $un -WindowStyle Hidden|Out-Null}
 WaitUntil { $w=Dialog; $w -and @((Buttons $w)|Where-Object {$_.Text -eq '同时清除本机学习记录、设置和缓存'}).Count -eq 1 } 'Welcome checkbox missing'
 $w=Dialog;[QzGui]::Away($w.Handle);return $w
}
function ContinueUninstall($w,[bool]$clear){$b=(Buttons $w)|Where-Object {$_.Text -eq '同时清除本机学习记录、设置和缓存'};if([QzGui]::SendMessage($b.Handle,0xF0,[IntPtr]::Zero,[IntPtr]::Zero).ToInt32() -ne 0){throw 'Checkbox not default unchecked'};if($clear){[QzGui]::SendMessage($b.Handle,0xF1,[IntPtr]1,[IntPtr]::Zero)|Out-Null};$next=(Buttons $w)|Where-Object {$_.Text -match '卸载|Uninstall|下一步|Next' -and $_.Text -ne $b.Text}|Select-Object -Last 1;if(!$next){throw "Missing action: $((Buttons $w).Text -join ',')"};[QzGui]::Click($next.Handle)}
function Finish {WaitUntil {!(Test-Path -LiteralPath $exe)} 'Uninstall timed out';Start-Sleep -Milliseconds 500;$w=Dialog;if($w){$b=(Buttons $w)|Where-Object {$_.Text -match '完成|Finish|关闭|Close'}|Select-Object -Last 1;if($b){[QzGui]::Click($b.Handle)}};WaitUntil {!(Test-Path -LiteralPath $un)} 'Uninstaller removal timed out'}
function Keep {if(!(Test-Path -LiteralPath (Join-Path $data 'record.txt')) -or !(Test-Path -LiteralPath (Join-Path $cache 'cache.txt'))){throw 'Expected retained data missing'}}
function ErrorDialog { @([QzGui]::Top() | Where-Object {$_.Class -eq '#32770' -and @([QzGui]::Children($_.Handle) | Where-Object {$_.Text -like '*未能安全清理以下目录*'}).Count}) | Select-Object -Last 1 }
function ErrorButton([string]$pattern) { WaitUntil {ErrorDialog} 'Cleanup error dialog missing';$w=ErrorDialog;[QzGui]::Away($w.Handle);$b=(Buttons $w)|Where-Object {$_.Text -match $pattern}|Select-Object -First 1;if(!$b){throw 'Expected error choice missing'};[QzGui]::Click($b.Handle) }
InstallTest;Seed;$locked=Join-Path $data 'locked.txt';[IO.File]::WriteAllText($locked,'locked record');$hold=[IO.File]::Open($locked,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{$w=Welcome;ContinueUninstall $w $true;WaitUntil {ErrorDialog} 'Locked file did not trigger cleanup failure';if(!(Test-Path -LiteralPath $locked)){throw 'Locked file missing'};ErrorButton '取消|Cancel';WaitUntil {!(Test-Path -LiteralPath $exe)} 'Continue uninstall failed';WaitUntil { $x=Dialog; $x -and @((Buttons $x)|Where-Object {$_.Text -match '完成|Finish'}).Count } 'Finish page missing';$w=Dialog;$summary=([QzGui]::Children($w.Handle)).Text -join ' ';if(!$summary.Contains($data)){throw 'Residual path missing on finish page'};Finish;if(!(Test-Path -LiteralPath $locked)){throw 'Remaining locked file lost'};Write-Output 'PASS cleanup failure shows residual path and allows continuing uninstall'}finally{$hold.Dispose()}
InstallTest;$hold=[IO.File]::Open($locked,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);try{$w=Welcome;ContinueUninstall $w $true;WaitUntil {ErrorDialog} 'Retry test failure missing'}finally{$hold.Dispose()};ErrorButton '重试|Retry';Finish;if(Test-Path -LiteralPath $data){throw 'Retry left data'};Write-Output 'PASS release lock and retry completes cleanup'
$outside=Join-Path $taskRoot 'outside-backup';New-Item -ItemType Directory -Path $outside -Force|Out-Null;[IO.File]::WriteAllText((Join-Path $outside 'backup.txt'),'outside backup');InstallTest;Seed;$link=Join-Path $data 'unsafe-link';New-Item -ItemType Junction -Path $link -Target $outside|Out-Null;$w=Welcome;ContinueUninstall $w $true;WaitUntil {ErrorDialog} 'Reparse link was not rejected';ErrorButton '取消|Cancel';Finish;if([IO.File]::ReadAllText((Join-Path $outside 'backup.txt')) -ne 'outside backup'){throw 'Outside backup changed'};if(!(Test-Path -LiteralPath $link)){throw 'Reparse root removed despite unsafe link'};[IO.Directory]::Delete($link);InstallTest;$w=Welcome;ContinueUninstall $w $true;Finish;if((Test-Path -LiteralPath $data) -or (Test-Path -LiteralPath $cache)){throw 'Final test data remains'};Write-Output 'PASS abnormal link rejected; outside backup preserved; subsequent safe cleanup completes'
