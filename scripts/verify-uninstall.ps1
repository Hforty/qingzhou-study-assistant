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
InstallTest;Seed
$w=Welcome;$cancel=(Buttons $w)|Where-Object {$_.Text -match '取消|Cancel'}|Select-Object -Last 1;[QzGui]::Click($cancel.Handle);Start-Sleep -Milliseconds 400;$w=Dialog;if($w){$yes=(Buttons $w)|Where-Object {$_.Text -match '是|Yes'}|Select-Object -First 1;if($yes){[QzGui]::Click($yes.Handle)}};WaitUntil {!(Dialog)} 'Cancel timed out';Keep;if(!(Test-Path -LiteralPath $exe)){throw 'Cancel removed program'};Write-Output 'PASS cancel keeps program, records and cache'
$w=Welcome;ContinueUninstall $w $false;Finish;Keep;Write-Output 'PASS unchecked uninstall retains records and cache'
InstallTest;Start-Process -FilePath $un -ArgumentList '/S' -WindowStyle Hidden|Out-Null;Finish;Keep;Write-Output 'PASS silent uninstall retains data'
InstallTest;$w=Welcome '/KEEP_APP_DATA';ContinueUninstall $w $true;Finish;Keep;Write-Output 'PASS /KEEP_APP_DATA overrides checked cleanup'
InstallTest;Start-Process -FilePath $un -ArgumentList '--updated' -WindowStyle Hidden|Out-Null;WaitUntil {!(Test-Path -LiteralPath $exe) -or (Dialog)} 'Update uninstall timed out';$w=Dialog;if($w){if(@((Buttons $w)|Where-Object {$_.Text -eq '同时清除本机学习记录、设置和缓存'}).Count){throw 'Update exposed cleanup page'};$b=(Buttons $w)|Where-Object {$_.Text -match '卸载|Uninstall|下一步|Next'}|Select-Object -Last 1;if($b){[QzGui]::Click($b.Handle)}};Finish;Keep;Write-Output 'PASS --updated skips cleanup and retains data'
InstallTest;$w=Welcome;ContinueUninstall $w $true;Finish;if((Test-Path -LiteralPath $data) -or (Test-Path -LiteralPath $cache)){throw 'Checked uninstall left data'};Write-Output 'PASS checked uninstall removes only dedicated data/cache'
