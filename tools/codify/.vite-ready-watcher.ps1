$p = 8000
$max = 180; $i = 0
while ($i -lt $max) {
  $i++
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$p/" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { Start-Process "http://localhost:$p"; break }
  } catch {}
  Start-Sleep -Milliseconds 500
}
