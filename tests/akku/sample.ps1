
$exe = $args[0]
$p = @(Get-CimInstance Win32_Process -Filter "Name='Notizen.exe' or Name='dwm.exe'" | Where-Object { $_.Name -eq 'dwm.exe' -or ($_.ExecutablePath -and $_.ExecutablePath.ToLower() -eq $exe) } | ForEach-Object {
  $t = 'browser'; if ($_.Name -eq 'dwm.exe') { $t = 'dwm' } elseif ($_.CommandLine -match '--type=([a-z-]+)') { $t = $Matches[1] }
  if ($t -eq 'utility' -and $_.CommandLine -match '--utility-sub-type=([A-Za-z.]+)') { $t = 'utility:' + $Matches[1] }
  [pscustomobject]@{ pid = [int]$_.ProcessId; type = $t; t = ([int64]$_.KernelModeTime + [int64]$_.UserModeTime) } })
$pids = @{}; foreach ($x in $p) { $pids['pid_' + $x.pid + '_'] = $x.pid }
$g = @{}
foreach ($s in (Get-Counter '\GPU Engine(*)\Running Time' -ErrorAction SilentlyContinue).CounterSamples) {
  $k = ($s.InstanceName -replace '^(pid_\d+_).*$', '$1')
  if ($pids.ContainsKey($k)) { $id = [string]$pids[$k]; if (-not $g.ContainsKey($id)) { $g[$id] = [int64]0 }; $g[$id] += [int64]$s.CookedValue }
}
@{ procs = $p; gpu = $g } | ConvertTo-Json -Depth 4 -Compress
