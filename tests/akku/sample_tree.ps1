# CPU-Zeit (100 ns) je Prozess im Baum unter der Wurzel-PID plus dwm, und GPU-Laufzeit je Prozess
$root = [int]$args[0]
$all = @(Get-CimInstance Win32_Process)
$kids = @{}
foreach ($x in $all) { $pp = [int]$x.ParentProcessId; if (-not $kids.ContainsKey($pp)) { $kids[$pp] = New-Object System.Collections.ArrayList }; [void]$kids[$pp].Add($x) }
$seen = @{}; $sel = New-Object System.Collections.ArrayList; $rootDate = $null
foreach ($x in $all) { if ([int]$x.ProcessId -eq $root) { [void]$sel.Add($x); $seen[$root] = 1; $rootDate = $x.CreationDate } }
$q = New-Object System.Collections.Queue; if ($rootDate) { $q.Enqueue($root) }
while ($q.Count -gt 0) {
  $id = $q.Dequeue()
  if ($kids.ContainsKey($id)) { foreach ($k in $kids[$id]) { $kp = [int]$k.ProcessId; if (-not $seen.ContainsKey($kp) -and $k.CreationDate -ge $rootDate) { $seen[$kp] = 1; [void]$sel.Add($k); $q.Enqueue($kp) } } }
}
foreach ($x in $all) { if ($x.Name -eq 'dwm.exe') { [void]$sel.Add($x) } }
$p = @($sel | ForEach-Object {
  $t = 'browser'; if ($_.Name -eq 'dwm.exe') { $t = 'dwm' } elseif ($_.CommandLine -match '--type=([a-z-]+)') { $t = $Matches[1] }
  if ($t -eq 'utility' -and $_.CommandLine -match '--utility-sub-type=([A-Za-z.]+)') { $t = 'utility:' + $Matches[1] }
  if ($t -eq 'renderer' -and $_.CommandLine -match '--extension-process') { $t = 'extension' }
  [pscustomobject]@{ pid = [int]$_.ProcessId; type = $t; t = ([int64]$_.KernelModeTime + [int64]$_.UserModeTime) } })
$pids = @{}; foreach ($x in $p) { $pids['pid_' + $x.pid + '_'] = $x.pid }
$g = @{}
foreach ($s in (Get-Counter '\GPU Engine(*)\Running Time' -ErrorAction SilentlyContinue).CounterSamples) {
  $k = ($s.InstanceName -replace '^(pid_\d+_).*$', '$1')
  if ($pids.ContainsKey($k)) { $id = [string]$pids[$k]; if (-not $g.ContainsKey($id)) { $g[$id] = [int64]0 }; $g[$id] += [int64]$s.CookedValue }
}
@{ procs = $p; gpu = $g } | ConvertTo-Json -Depth 4 -Compress
