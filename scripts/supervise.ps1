# LabPilot supervisor - keeps Ollama + Web(8080) + tunnel alive
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$sys  = Join-Path $env:SystemRoot 'System32'
Set-Location $root

$logDir = Join-Path $root '.workbuddy\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$watchLog  = Join-Path $logDir 'supervisor.log'

# single instance guard: only one supervisor per machine
$lockPath = Join-Path $logDir 'supervisor.lock'
try {
    $script:lockHandle = [System.IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
} catch {
    Write-Host ""
    Write-Host "  Another LabPilot supervisor is already running - exiting." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    exit 0
}

function Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $watchLog -Value $line -Encoding utf8
    Write-Host $line
    if ((Get-Item $watchLog).Length -gt 102400) {
        Get-Content $watchLog -Tail 300 | Set-Content $watchLog -Encoding utf8
    }
}

function Test-Port([int]$port) {
    # raw TCP check - no proxy, no DNS
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect('127.0.0.1', $port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(1500, $false)
        if ($ok -and $client.Connected) { $client.Close(); return $true }
        $client.Close(); return $false
    } catch { return $false }
}

function Get-Procs([string]$pattern) {
    return @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match $pattern })
}

function Start-Wrapper($script, $title) {
    Start-Process -FilePath (Join-Path $sys 'cmd.exe') `
                  -ArgumentList '/c', "`"$PSScriptRoot\$script`"" `
                  -WorkingDirectory $root -WindowStyle Hidden | Out-Null
    Log "started $title"
}

Write-Host ""
Write-Host "  LabPilot supervisor running." -ForegroundColor Cyan
Write-Host "  Close this window to stop all services." -ForegroundColor DarkGray
Write-Host ""
Log "supervisor started (pid $PID)"

$lastTunnelSpawn = [datetime]::MinValue

while ($true) {
    # 1. Ollama
    if (-not (Test-Port 11434)) {
        if (-not @(Get-Process -Name 'ollama' -ErrorAction SilentlyContinue).Count) {
            Start-Wrapper 'run-ollama.cmd' 'ollama'
        }
    }

    # 2. Web server
    if (-not (Test-Port 8080)) {
        Start-Wrapper 'run-server.cmd' 'web server'
    }

    $useNgrok = Test-Path (Join-Path $root '.workbuddy\ngrok.yml')

    # 3. Tunnel process presence
    if ($useNgrok) {
        $tunnelUp = @(Get-Process -Name 'ngrok' -ErrorAction SilentlyContinue).Count -gt 0
        if (-not $tunnelUp) {
            $wrapperAlive = (Get-Procs 'run-ngrok\.cmd').Count -gt 0
            if (-not $wrapperAlive -and ((Get-Date) - $lastTunnelSpawn).TotalSeconds -ge 60) {
                Start-Wrapper 'run-ngrok.cmd' 'ngrok tunnel'
                $lastTunnelSpawn = Get-Date
            }
        }
    } else {
        $tunnelUp = @(Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue).Count -gt 0
        if (-not $tunnelUp) {
            $wrapperAlive = (Get-Procs 'run-tunnel\.cmd').Count -gt 0
            if (-not $wrapperAlive -and ((Get-Date) - $lastTunnelSpawn).TotalSeconds -ge 60) {
                Start-Wrapper 'run-tunnel.cmd' 'tunnel'
                $lastTunnelSpawn = Get-Date
            }
        }

        # NOTE: no health judgement on the tunnel - by design.
        # Every quick-tunnel restart hands out a NEW random domain, which kills the
        # link people are already using. So the only thing we ever react to is the
        # process being gone. If cloudflared is alive but the domain is dead, the
        # supervisor deliberately does nothing - double-click start.cmd to reset.
    }

    # 4. Refresh CURRENT_URL.txt
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'current-url.ps1') | Out-Null

    Start-Sleep -Seconds 30
}
