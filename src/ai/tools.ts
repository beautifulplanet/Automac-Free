import { exec } from 'child_process';

/** Invokes a read-only diagnostic tool by name with string parameters. */
export interface ToolCall {
  tool: string;
  params: Record<string, string>;
}

/** Result of a tool invocation (stdout or validation error text). */
export interface ToolResult {
  tool: string;
  success: boolean;
  output: string;
}

const SANITIZE_RE = /['";$`{}()|&<>\r\n\0]/g;

const ALLOWED_EVENT_LOGS = new Set(['Application', 'System', 'Setup']);

/** Strips shell metacharacters from user-provided parameter values. */
function sanitize(input: string): string {
  return input.replace(SANITIZE_RE, '');
}

function runPS(command: string): Promise<string> {
  return new Promise((resolve) => {
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    exec(
      `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          resolve(`Error: ${stderr.trim() || error.message}`);
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function validateLargeFilesPath(path: string): string | null {
  if (path.length > 200) {
    return 'Path must be at most 200 characters';
  }
  if (path.startsWith('\\\\')) {
    return 'UNC paths are not allowed';
  }
  if (path.includes('..')) {
    return 'Path must not contain ..';
  }
  if (!/^[A-Za-z]:\\/.test(path)) {
    return 'Path must be a drive path (e.g. C:\\Users)';
  }
  return null;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parsePositiveNumber(raw: string | undefined): number | null {
  const n = Number.parseFloat(String(raw ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Human-readable tool list for the AI system prompt (all read-only, auto-run). */
export const TOOL_DESCRIPTIONS = [
  'system_info() — OS, CPU, RAM, hostname, uptime (read-only, auto-runs)',
  'list_running_processes() — top 50 processes by memory with CPU and RAM (read-only, auto-runs)',
  'list_installed_programs() — installed programs from registry (read-only, auto-runs)',
  'find_program(name) — search installed programs by display name (read-only, auto-runs)',
  'list_startup_items() — HKLM/HKCU Run keys (read-only, auto-runs)',
  'scan_disk_usage() — filesystem drives used/free/total (read-only, auto-runs)',
  'find_large_files(path, min_size_mb) — largest files under path above threshold (read-only, auto-runs)',
  'find_temp_files() — user temp folder size and largest items (read-only, auto-runs)',
  'check_event_log(log_name, hours) — Application/System/Setup errors in window (read-only, auto-runs)',
  'check_windows_update() — pending and recent installed updates (read-only, auto-runs)',
  'check_network() — ping 8.8.8.8 and DNS resolution for google.com (read-only, auto-runs)',
  'list_services(filter, status) — services optionally filtered by name and Running/Stopped (read-only, auto-runs)',
  'check_disk_health() — physical disks health and size (read-only, auto-runs)',
].join('\n');

export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const base = { tool: call.tool };

  switch (call.tool) {
    case 'system_info': {
      const cmd =
        "Get-CimInstance Win32_OperatingSystem | Select Caption,Version,OSArchitecture,LastBootUpTime | ConvertTo-Json; Get-CimInstance Win32_Processor | Select Name,NumberOfCores,MaxClockSpeed | ConvertTo-Json; Get-CimInstance Win32_PhysicalMemory | Measure-Object Capacity -Sum | Select @{N='TotalRAM_GB';E={[math]::Round($_.Sum/1GB,1)}} | ConvertTo-Json; [System.Environment]::MachineName | ConvertTo-Json; (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime | Select @{N='Uptime';E={$_.ToString('d\\.hh\\:mm')}} | ConvertTo-Json";
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    case 'list_running_processes': {
      const cmd =
        "Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 50 Name,Id,@{N='CPU_Seconds';E={[math]::Round($_.CPU,1)}},@{N='Memory_MB';E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json";
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    case 'list_installed_programs': {
      const cmd =
        "Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*,HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object DisplayName | Select DisplayName,DisplayVersion,Publisher,InstallDate | Sort DisplayName | ConvertTo-Json";
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    case 'find_program': {
      const rawName = call.params.name ?? '';
      const safe = sanitize(rawName);
      const cmd = `$escaped = [regex]::Escape('${safe.replace(/'/g, "''")}'); Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*,HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object { $_.DisplayName -match $escaped } | Select DisplayName,DisplayVersion,Publisher,UninstallString | ConvertTo-Json`;
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    case 'list_startup_items': {
      const cmd =
        "$items = @(); $items += Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue | ForEach-Object { $_.PSObject.Properties | Where-Object { $_.Name -notin 'PSPath','PSParentPath','PSChildName','PSDrive','PSProvider' } | Select @{N='Name';E={$_.Name}},@{N='Command';E={$_.Value}},@{N='Location';E={'HKLM Run'}} }; $items += Get-ItemProperty 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue | ForEach-Object { $_.PSObject.Properties | Where-Object { $_.Name -notin 'PSPath','PSParentPath','PSChildName','PSDrive','PSProvider' } | Select @{N='Name';E={$_.Name}},@{N='Command';E={$_.Value}},@{N='Location';E={'HKCU Run'}} }; $items | ConvertTo-Json";
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    case 'scan_disk_usage': {
      const cmd =
        "Get-PSDrive -PSProvider FileSystem | Select Name,@{N='Used_GB';E={[math]::Round($_.Used/1GB,1)}},@{N='Free_GB';E={[math]::Round($_.Free/1GB,1)}},@{N='Total_GB';E={[math]::Round(($_.Used+$_.Free)/1GB,1)}} | ConvertTo-Json";
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    case 'find_large_files': {
      const rawPath = sanitize(call.params.path ?? '');
      const pathErr = validateLargeFilesPath(rawPath);
      if (pathErr) {
        return { ...base, success: false, output: pathErr };
      }
      const minMb = parsePositiveNumber(call.params.min_size_mb);
      if (minMb === null) {
        return { ...base, success: false, output: 'min_size_mb must be a positive number' };
      }
      const safePath = rawPath.replace(/'/g, "''");
      const cmd = `$minBytes = ${minMb} * 1MB; Get-ChildItem -Path '${safePath}' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt $minBytes } | Sort-Object Length -Descending | Select-Object -First 100 Name,@{N='Size_MB';E={[math]::Round($_.Length/1MB,1)}},DirectoryName | ConvertTo-Json`;
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    case 'find_temp_files': {
      const cmd =
        "Get-ChildItem $env:TEMP -ErrorAction SilentlyContinue | Measure-Object Length -Sum | Select Count,@{N='Total_MB';E={[math]::Round($_.Sum/1MB,1)}} | ConvertTo-Json; Get-ChildItem $env:TEMP -ErrorAction SilentlyContinue | Sort Length -Descending | Select-Object -First 20 Name,@{N='Size_MB';E={[math]::Round($_.Length/1MB,1)}} | ConvertTo-Json";
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    case 'check_event_log': {
      const logName = (call.params.log_name?.trim() || 'Application');
      if (!ALLOWED_EVENT_LOGS.has(logName)) {
        return {
          ...base,
          success: false,
          output: 'Invalid log. Allowed: Application, System, Setup',
        };
      }
      const hours = parsePositiveInt(call.params.hours, 24);
      const safeLog = logName.replace(/'/g, "''");
      const cmd = `$start = (Get-Date).AddHours(-${hours}); Get-WinEvent -FilterHashtable @{LogName='${safeLog}';Level=1,2,3;StartTime=$start} -MaxEvents 50 -ErrorAction SilentlyContinue | Select TimeCreated,LevelDisplayName,Message | ConvertTo-Json`;
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    case 'check_windows_update': {
      const cmd =
        "$session = New-Object -ComObject Microsoft.Update.Session; $searcher = $session.CreateUpdateSearcher(); $pending = $searcher.Search('IsInstalled=0'); $pending.Updates | Select Title,MsrcSeverity | ConvertTo-Json; $searcher.Search('IsInstalled=1') | ForEach-Object { $_.Updates } | Sort-Object LastDeploymentChangeTime -Descending | Select-Object -First 5 Title,LastDeploymentChangeTime | ConvertTo-Json";
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    case 'check_network': {
      const cmd =
        "$ping = Test-Connection 8.8.8.8 -Count 1 -ErrorAction SilentlyContinue; $dns = Resolve-DnsName google.com -ErrorAction SilentlyContinue | Select-Object -First 1; @{Connectivity=if($ping){'Connected'}else{'Disconnected'};Latency_ms=if($ping){$ping.ResponseTime}else{'N/A'};DNS=if($dns){'Working'}else{'Failed'}} | ConvertTo-Json";
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    case 'list_services': {
      const statusRaw = sanitize(call.params.status ?? '');
      if (statusRaw !== '' && statusRaw !== 'Running' && statusRaw !== 'Stopped') {
        return {
          ...base,
          success: false,
          output: 'Invalid status. Allowed: Running, Stopped, or empty for all.',
        };
      }
      const safeStatus = statusRaw.replace(/'/g, "''");
      const filterRaw = call.params.filter?.trim();
      let cmd: string;
      if (filterRaw) {
        const safeFilter = sanitize(filterRaw).replace(/'/g, "''");
        cmd = `$escaped = [regex]::Escape('${safeFilter}'); Get-Service | Where-Object { ($_.Name -match $escaped -or $_.DisplayName -match $escaped) -and ($_.Status -eq '${safeStatus}' -or '${safeStatus}' -eq '') } | Select Name,DisplayName,Status | ConvertTo-Json`;
      } else {
        cmd = `Get-Service | Where-Object { $_.Status -eq '${safeStatus}' -or '${safeStatus}' -eq '' } | Select Name,DisplayName,Status | ConvertTo-Json`;
      }
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    case 'check_disk_health': {
      const cmd =
        "Get-PhysicalDisk | Select FriendlyName,MediaType,HealthStatus,@{N='Size_GB';E={[math]::Round($_.Size/1GB,0)}} | ConvertTo-Json";
      const output = await runPS(cmd);
      return { ...base, success: !output.startsWith('Error: '), output };
    }
    default:
      return { ...base, success: false, output: `Unknown tool: ${call.tool}` };
  }
}
