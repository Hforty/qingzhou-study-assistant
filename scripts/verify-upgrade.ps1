param([string]$OldSetup,[string]$NewSetup)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $env:TEMP 'qingzhou-v105-work'))
$install=[IO.Path]::GetFullPath((Join-Path $taskRoot 'installed-check'))
$profile=[IO.Path]::GetFullPath((Join-Path $taskRoot 'upgrade-profile'))
if(-not $install.StartsWith($taskRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe install path'}
if(-not $OldSetup){$OldSetup=Join-Path $taskRoot 'isolated-1.0.4\Qingzhou-Verify-1.0.4.exe'}
if(-not $NewSetup){$NewSetup=Join-Path $taskRoot 'isolated-1.0.5\Qingzhou-Verify-1.0.5.exe'}
function Registration { @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object {$_.PSObject.Properties['DisplayName'] -and $_.DisplayName -eq '轻舟升级验收'}) }
if(@(Registration).Count -gt 0 -or (Test-Path -LiteralPath $install)){throw 'Existing test install was not changed.'}
$formalBefore=@(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object {$_.PSObject.Properties['DisplayName'] -and $_.DisplayName -eq '轻舟学习助手'} | Select-Object PSPath,DisplayVersion,InstallLocation | ConvertTo-Json -Compress)
$env:QINGZHOU_TEST_PROFILE=$profile
$env:QINGZHOU_UPGRADE_FIXTURE=Join-Path $taskRoot 'upgrade-fixture.json'
$env:QINGZHOU_TEST_EXE=Join-Path $install '轻舟升级验收.exe'
function InstallVersion($setup,$version){
 if(-not (Test-Path -LiteralPath $setup)){throw 'Setup missing'}
 if((Get-Item -LiteralPath $setup).VersionInfo.ProductName -ne '轻舟升级验收'){throw 'Only isolated verification installers are allowed; formal installers were not launched.'}
 $process=Start-Process -FilePath $setup -ArgumentList "/S /D=$install" -WindowStyle Hidden -PassThru
 $deadline=[DateTime]::UtcNow.AddSeconds(55)
 do {
   $entries=@(Registration)
   if((Test-Path -LiteralPath $env:QINGZHOU_TEST_EXE) -and $entries.Count -eq 1 -and $entries[0].DisplayVersion -eq $version){
     try{if((Get-Item -LiteralPath $env:QINGZHOU_TEST_EXE).VersionInfo.FileVersion -eq $version){$process.WaitForExit(2000)|Out-Null;return}}catch{}
   }
   Start-Sleep -Milliseconds 250
 }while([DateTime]::UtcNow -lt $deadline)
 $actualVersion=if(Test-Path -LiteralPath $env:QINGZHOU_TEST_EXE){(Get-Item -LiteralPath $env:QINGZHOU_TEST_EXE).VersionInfo.FileVersion}else{'missing executable'}
 throw "Install $version timeout; executable=$actualVersion; registrations=$((Registration | Select-Object DisplayName,DisplayVersion | ConvertTo-Json -Compress))"
}
$installed=$false
$profileSeeded=$false
try{
 $installed=$true;InstallVersion $OldSetup '1.0.4'
 & node.exe (Join-Path $PSScriptRoot 'verify-upgrade-records.cjs') seed
 if($LASTEXITCODE -ne 0){throw 'Old records seed failed'}
 $profileSeeded=$true
 InstallVersion $NewSetup '1.0.5'
 & node.exe (Join-Path $PSScriptRoot 'verify-upgrade-records.cjs') verify
 if($LASTEXITCODE -ne 0){throw 'Record upgrade failed'}
 Write-Output 'PASS native covering installation and Windows version registration'
}finally{
 if($installed){
   $checked=[IO.Path]::GetFullPath($install)
   if(-not $checked.StartsWith($taskRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Refusing unsafe uninstall'}
   $uninstaller=Join-Path $checked 'Uninstall 轻舟升级验收.exe'
   if(Test-Path -LiteralPath $uninstaller){
     $process=Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru
     $deadline=[DateTime]::UtcNow.AddSeconds(45)
     while((@(Registration).Count -gt 0 -or (Test-Path -LiteralPath $env:QINGZHOU_TEST_EXE)) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 250}
     if(@(Registration).Count -gt 0 -or (Test-Path -LiteralPath $env:QINGZHOU_TEST_EXE)){throw 'Test uninstall failed'}
     if($profileSeeded){
       if(-not (Test-Path -LiteralPath (Join-Path $profile 'Local Storage\leveldb'))){throw 'Independent profile lost after uninstall'}
       Write-Output 'PASS native uninstall: application/registration removed, independent learning records retained'
     }
   }
 }
 $formalAfter=@(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object {$_.PSObject.Properties['DisplayName'] -and $_.DisplayName -eq '轻舟学习助手'} | Select-Object PSPath,DisplayVersion,InstallLocation | ConvertTo-Json -Compress)
 if(($formalBefore -join '') -ne ($formalAfter -join '')){throw 'Formal installation changed unexpectedly'}
 $env:QINGZHOU_TEST_EXE=$null;$env:QINGZHOU_TEST_PROFILE=$null;$env:QINGZHOU_UPGRADE_FIXTURE=$null
}
