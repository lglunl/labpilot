# Report current public URL and save it to CURRENT_URL.txt
# Supports two tunnel backends: ngrok fixed domain (preferred) and cloudflare quick tunnel
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$out  = Join-Path $root 'CURRENT_URL.txt'
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$ngrokCfg = Join-Path $root '.workbuddy\ngrok.yml'

if (Test-Path $ngrokCfg) {
    # ---- ngrok mode: fixed domain ----
    $domain = $null
    $line = (Get-Content $ngrokCfg | Where-Object { $_ -match '^\s*domain:\s*\S+' } | Select-Object -First 1)
    if ($line) { $domain = ($line -split ':', 2)[1].Trim().Trim('"').Trim("'") }

    $alive = @(Get-Process -Name 'ngrok' -ErrorAction SilentlyContinue).Count -gt 0
    $url = if ($domain) { "https://$domain" } else { $null }

    if ($url) {
        $state = if ($alive) { '已连接（ngrok 固定域名，重启后地址不变）' } else { '未连接（ngrok 重试中）' }
        Set-Content -Path $out -Encoding utf8 -Value @(
            "当前外网地址: $url",
            "隧道状态: $state",
            "更新时间: $stamp",
            "本地地址: http://127.0.0.1:8080"
        )
        Write-Host ""
        Write-Host "  当前外网地址： " -NoNewline
        Write-Host $url -ForegroundColor Green
        Write-Host "  状态：$state" -ForegroundColor DarkGray
    } else {
        Write-Host "  ngrok 配置里没有找到 domain，请检查 .workbuddy\ngrok.yml" -ForegroundColor Yellow
    }
    return
}

# ---- cloudflare quick tunnel mode ----
$log = Join-Path $root '.workbuddy\logs\tunnel.log'
$alive = @(Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue).Count -gt 0

$url = $null
if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches |
         ForEach-Object { $_.Matches.Value } | Select-Object -Last 1
    if ($m) { $url = $m }
}

# 验证域名在 Cloudflare 侧是否真的注册（隧道断开后会被注销，返回 NXDOMAIN）
$dnsOk = $false
if ($url) {
    $hostName = ([uri]$url).Host
    try { $dnsOk = [bool](Resolve-DnsName -Name $hostName -Type A -ErrorAction Stop | Select-Object -First 1) } catch { $dnsOk = $false }
}

if ($alive -and $url -and $dnsOk) {
    Set-Content -Path $out -Encoding utf8 -Value @(
        "当前外网地址: $url",
        "隧道状态: 已连接",
        "更新时间: $stamp",
        "本地地址: http://127.0.0.1:8080"
    )
    Write-Host ""
    Write-Host "  当前外网地址： " -NoNewline
    Write-Host $url -ForegroundColor Green
    Write-Host "  (已写入 CURRENT_URL.txt)" -ForegroundColor DarkGray
} elseif (-not $alive) {
    Set-Content -Path $out -Encoding utf8 -Value @(
        "隧道状态: 未连接（正在重试，Cloudflare 可能限流）",
        "本地地址: http://127.0.0.1:8080",
        "更新时间: $stamp"
    )
    Write-Host ""
    Write-Host "  隧道未连接：正在自动重试（Cloudflare 限流，需等待数分钟到数十分钟）。" -ForegroundColor Yellow
    Write-Host "  本地可先用 http://127.0.0.1:8080 访问。" -ForegroundColor DarkGray
} else {
    Set-Content -Path $out -Encoding utf8 -Value @(
        "隧道状态: 正在重连（上次的地址已失效）",
        "本地地址: http://127.0.0.1:8080",
        "更新时间: $stamp"
    )
    Write-Host ""
    Write-Host "  隧道在重连：上次的地址已被 Cloudflare 注销，等新地址分配。" -ForegroundColor Yellow
    Write-Host "  本地可先用 http://127.0.0.1:8080 访问。" -ForegroundColor DarkGray
}
