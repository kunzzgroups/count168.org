# Remove MySQL DEFINER clauses from a dump so import works without SET USER privilege.
# Usage: .\strip_sql_definer.ps1 -InputPath 'C:\path\dump.sql' [-OutputPath 'C:\path\out.sql']
param(
    [Parameter(Mandatory = $true)]
    [string] $InputPath,
    [string] $OutputPath = ""
)
if (-not (Test-Path -LiteralPath $InputPath)) {
    Write-Error "File not found: $InputPath"
    exit 1
}
if (-not $OutputPath) {
    $dir = Split-Path -Parent $InputPath
    $name = [System.IO.Path]::GetFileNameWithoutExtension($InputPath)
    $ext = [System.IO.Path]::GetExtension($InputPath)
    $OutputPath = Join-Path $dir ($name + "_no_definer" + $ext)
}
$text = [System.IO.File]::ReadAllText($InputPath)
# Matches: DEFINER=`user`@`host` followed by optional whitespace
$stripped = [regex]::Replace($text, 'DEFINER=`[^`]+`@`[^`]+`\s*', '')
[System.IO.File]::WriteAllText($OutputPath, $stripped, [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote: $OutputPath"
