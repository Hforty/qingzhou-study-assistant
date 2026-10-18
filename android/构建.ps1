param([ValidateSet('assembleDebug','assembleRelease','test')][string]$Task='assembleRelease')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$jdk=(Get-ChildItem -LiteralPath (Join-Path $root '开发工具/jdk21') -Directory|Select-Object -First 1).FullName
$env:JAVA_HOME=$jdk
$env:ANDROID_HOME=Join-Path $root '开发工具/android-sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:ANDROID_USER_HOME=Join-Path $root '构建缓存/android-user'
$env:GRADLE_USER_HOME=Join-Path $root '构建缓存/gradle'
$env:QINGZHOU_RELEASE_CONFIG=Join-Path $root '签名/signing.json'
$env:TEMP=Join-Path $root '构建缓存/temp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Path $env:ANDROID_USER_HOME,$env:GRADLE_USER_HOME,$env:TEMP -Force|Out-Null
$gradle=Join-Path $root '开发工具/gradle/gradle-9.6.0/bin/gradle.bat'
Push-Location $PSScriptRoot
try {
    & $gradle $Task --no-daemon --console=plain "-Duser.home=$(Join-Path $root '构建缓存/java-home')" 2>&1 | Tee-Object -FilePath (Join-Path $root "验收记录/build-$Task.log")
    if($LASTEXITCODE -ne 0){throw "构建失败，详见验收日志"}
    if($Task -eq 'assembleRelease'){
        $apk=Join-Path $PSScriptRoot 'app/build/outputs/apk/release/app-release.apk'
        if(-not(Test-Path -LiteralPath $apk)){throw '未生成已签名 APK'}
        $output=Join-Path $root '安装包/轻舟学习助手-Android-1.0.1.apk'
        Copy-Item -LiteralPath $apk -Destination $output -Force
        Get-FileHash -LiteralPath $output -Algorithm SHA256|Format-List
        Write-Output "APK: $output"
    }
}finally{Pop-Location}
