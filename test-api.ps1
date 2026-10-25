# ==============================================================================
# Nom Nom AI - End-to-End API Test Suite
# ==============================================================================
# Why 172.28.233.147 and not localhost?
#   Podman on Windows runs containers inside a WSL2 VM. That VM gets its own
#   IP on the WSL2 virtual network (172.28.x.x). Podman binds container ports
#   to 0.0.0.0 *inside the VM*, not to Windows' localhost. Until a .wslconfig
#   mirrored-networking entry is added, you must use the WSL2 VM's IP directly.
#   Run:  wsl -d podman-machine-default -- ip addr show eth0
#   to find the current IP (it can change on VM restart).
#
# Usage:
#   .\test-api.ps1
#   .\test-api.ps1 -BaseUrl "http://172.28.233.147:3000"
#   .\test-api.ps1 -BaseUrl "http://localhost:3000" -OutFile ".\test-results\run.log"
# ==============================================================================

param (
    [string]$BaseUrl = "http://172.28.233.147:3000",
    [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"

$PassCount = 0
$FailCount = 0
$Results   = [System.Collections.Generic.List[PSCustomObject]]::new()
$RunStart  = Get-Date

# ─── Output helper ───────────────────────────────────────────────────────────
# Writes to the console AND appends to $OutFile when one is specified.
function Write-Out {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
    if ($OutFile) { Add-Content -Path $OutFile -Value $Message }
}

function Run-Test {
    param (
        [string]$Name,
        [scriptblock]$Script
    )
    $start = Get-Date
    Write-Out -Message "  [$Name] ... " -Color Gray
    try {
        & $Script
        $elapsed = ((Get-Date) - $start).TotalMilliseconds
        Write-Out -Message "  PASSED  ($([int]$elapsed) ms)" -Color Green
        $script:PassCount++
        $script:Results.Add([PSCustomObject]@{ Test=$Name; Status="PASS"; Ms=[int]$elapsed; Error="" })
    } catch {
        $elapsed = ((Get-Date) - $start).TotalMilliseconds
        $errMsg  = $_.Exception.Message
        Write-Out -Message "  FAILED  ($([int]$elapsed) ms)" -Color Red
        Write-Out -Message "    Error: $errMsg"              -Color DarkRed
        $script:FailCount++
        $script:Results.Add([PSCustomObject]@{ Test=$Name; Status="FAIL"; Ms=[int]$elapsed; Error=$errMsg })
    }
}

# ─── Prepare output file ─────────────────────────────────────────────────────
if ($OutFile) {
    $dir = Split-Path $OutFile
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    Set-Content -Path $OutFile -Value ""   # clear previous run
}

Write-Out "`n============================================================" Cyan
Write-Out " Nom Nom AI  -  API Test Suite" Cyan
Write-Out " Target : $BaseUrl" Cyan
Write-Out " Started: $($RunStart.ToString('yyyy-MM-dd HH:mm:ss'))" Cyan
Write-Out "============================================================`n" Cyan

# ─── 1. Health Check ─────────────────────────────────────────────────────────
Run-Test "GET /health - System Health Check" {
    $res = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET
    if ($res.status -ne "ok") { throw "Expected status 'ok', got '$($res.status)'" }
}

# ─── 2. Authentication ───────────────────────────────────────────────────────
$testEmail = "testuser_$(Get-Random)@example.com"
$testPassword = "TestPassword123!"
$token = $null
$authHeaders = @{}

Run-Test "POST /api/auth/register - Register User" {
    $body = @{
        email       = $testEmail
        password    = $testPassword
        displayName = "Test Chef"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$BaseUrl/api/auth/register" `
        -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $body

    if (-not $res.token) { throw "No token returned upon registration" }
    $script:token = $res.token
    $script:authHeaders = @{
        "Authorization" = "Bearer $($script:token)"
        "Content-Type"  = "application/json"
    }
}

Run-Test "POST /api/auth/login - User Login" {
    $body = @{
        email    = $testEmail
        password = $testPassword
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" `
        -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $body

    if (-not $res.token) { throw "No token returned upon login" }
}

Run-Test "GET /api/auth/me - Get Current Profile" {
    $res = Invoke-RestMethod -Uri "$BaseUrl/api/auth/me" `
        -Method GET `
        -Headers $authHeaders

    if ($res.email -ne $testEmail) { throw "Returned profile email mismatch" }
}

Run-Test "POST /api/auth/goals - Set Nutrition Target" {
    $body = @{
        goalType    = "DAILY_CALORIES"
        targetValue = 2200
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$BaseUrl/api/auth/goals" `
        -Method POST `
        -Headers $authHeaders `
        -Body $body

    if ($res.goalType -ne "DAILY_CALORIES") { throw "Failed to save user goal" }
}

Run-Test "GET /api/auth/goals - Fetch Active Goals" {
    $res = Invoke-RestMethod -Uri "$BaseUrl/api/auth/goals" `
        -Method GET `
        -Headers $authHeaders

    if ($res.Count -lt 1) { throw "Expected at least 1 goal" }
}

# ─── 3. Ingredients Search ──────────────────────────────────────────────────
$ingredientId = $null

Run-Test "GET /api/ingredients/search - Query Ingredients Database" {
    $res = Invoke-RestMethod -Uri "$BaseUrl/api/ingredients/search?q=chicken" `
        -Method GET `
        -Headers $authHeaders

    if ($res.Count -gt 0) {
        $script:ingredientId = $res[0].id
    }
}

# ─── 4. Pantry Management ───────────────────────────────────────────────────
$pantryItemId = $null

Run-Test "POST /api/pantry/items - Add Item to Pantry" {
    if (-not $script:ingredientId) {
        $all = Invoke-RestMethod -Uri "$BaseUrl/api/ingredients/search?q=a" -Method GET -Headers $authHeaders
        if ($all.Count -gt 0) { $script:ingredientId = $all[0].id }
    }

    if ($script:ingredientId) {
        $body = @{
            ingredientId = $script:ingredientId
            quantity     = 500
            unit         = "grams"
        } | ConvertTo-Json

        $res = Invoke-RestMethod -Uri "$BaseUrl/api/pantry/items" `
            -Method POST `
            -Headers $authHeaders `
            -Body $body

        $script:pantryItemId = $res.id
        if (-not $res.id) { throw "No pantry item ID returned" }
    } else {
        Write-Out "    (Skipped: no ingredients seeded)" Yellow
    }
}

Run-Test "GET /api/pantry - List User Pantry" {
    $res = Invoke-RestMethod -Uri "$BaseUrl/api/pantry" `
        -Method GET `
        -Headers $authHeaders

    if ($null -eq $res) { throw "No response received" }
}

Run-Test "PATCH /api/pantry/items/:id - Update Quantity" {
    if ($script:pantryItemId) {
        $body = @{
            quantity = 750
            unit     = "grams"
        } | ConvertTo-Json

        $res = Invoke-RestMethod -Uri "$BaseUrl/api/pantry/items/$($script:pantryItemId)" `
            -Method PATCH `
            -Headers $authHeaders `
            -Body $body

        if ($res.quantity -ne 750) { throw "Quantity did not update" }
    }
}

# ─── 5. Recipe Generation & Management ───────────────────────────────────────
$recipeId = $null

Run-Test "POST /api/recipes/generate - AI Recipe Generation" {
    $body = @{
        ingredients   = @("Chicken Breast", "Garlic", "Olive Oil")
        mealType      = "DINNER"
        tagPreference = "HEALTHY"
        cuisine       = "NORTH_INDIAN"
        servings      = 2
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$BaseUrl/api/recipes/generate" `
        -Method POST `
        -Headers $authHeaders `
        -Body $body

    if (-not $res.id) { throw "No recipe generated" }
    $script:recipeId = $res.id
}

Run-Test "GET /api/recipes/:id - Get Recipe Details" {
    if ($script:recipeId) {
        $res = Invoke-RestMethod -Uri "$BaseUrl/api/recipes/$($script:recipeId)" `
            -Method GET `
            -Headers $authHeaders

        if ($res.id -ne $script:recipeId) { throw "Recipe ID mismatch" }
    }
}

Run-Test "POST /api/recipes/:id/save - Bookmark Recipe" {
    if ($script:recipeId) {
        $res = Invoke-RestMethod -Uri "$BaseUrl/api/recipes/$($script:recipeId)/save" `
            -Method POST `
            -Headers $authHeaders

        if (-not $res.saved) { throw "Failed to save recipe" }
    }
}

Run-Test "GET /api/recipes/my - Get My Generated and Saved Recipes" {
    $res = Invoke-RestMethod -Uri "$BaseUrl/api/recipes/my" `
        -Method GET `
        -Headers $authHeaders

    if ($null -eq $res.generated) { throw "Missing 'generated' recipes list" }
}

Run-Test "POST /api/recipes/:id/publish - Publish to Community Feed" {
    if ($script:recipeId) {
        $res = Invoke-RestMethod -Uri "$BaseUrl/api/recipes/$($script:recipeId)/publish" `
            -Method POST `
            -Headers $authHeaders

        if (-not $res.isPublished) { throw "Recipe is not published" }
    }
}

# ─── 6. Community Feed ───────────────────────────────────────────────────────
Run-Test "GET /api/feed - Browse Community Recipes Feed" {
    $res = Invoke-RestMethod -Uri "$BaseUrl/api/feed" `
        -Method GET

    if ($null -eq $res.data) { throw "Missing 'data' array in feed response" }
}

# ─── 7. Rule-Based Suggestions ──────────────────────────────────────────────
Run-Test "GET /api/suggestions - Fetch Meal Suggestions" {
    $res = Invoke-RestMethod -Uri "$BaseUrl/api/suggestions" `
        -Method GET `
        -Headers $authHeaders

    if ($null -eq $res) { throw "Suggestions endpoint returned empty response" }
}

# ─── 8. Nutrition Logging ────────────────────────────────────────────────────
Run-Test "POST /api/nutrition-log - Log Consumed Meal" {
    if ($script:recipeId) {
        $body = @{
            recipeId = $script:recipeId
            servings = 1
            mealType = "DINNER"
        } | ConvertTo-Json

        $res = Invoke-RestMethod -Uri "$BaseUrl/api/nutrition-log" `
            -Method POST `
            -Headers $authHeaders `
            -Body $body

        if (-not $res.id) { throw "Failed to log meal" }
    }
}

Run-Test "GET /api/nutrition-log - Get Daily Nutrition Aggregates" {
    $res = Invoke-RestMethod -Uri "$BaseUrl/api/nutrition-log" `
        -Method GET `
        -Headers $authHeaders

    if ($null -eq $res) { throw "Nutrition log returned empty" }
}

# ─── 9. Dashboard ────────────────────────────────────────────────────────────
Run-Test "GET /api/dashboard - Get Daily Overview & Target Progress" {
    $res = Invoke-RestMethod -Uri "$BaseUrl/api/dashboard" `
        -Method GET `
        -Headers $authHeaders

    if ($null -eq $res.targets) { throw "Missing 'targets' in dashboard" }
}

# ─── 10. Interactive Cooking Session ─────────────────────────────────────────
Run-Test "POST /api/cooking/sessions - Initialize Cooking Assistant" {
    if ($script:recipeId) {
        $body = @{
            recipeId = $script:recipeId
        } | ConvertTo-Json

        $res = Invoke-RestMethod -Uri "$BaseUrl/api/cooking/sessions" `
            -Method POST `
            -Headers $authHeaders `
            -Body $body

        if (-not $res.sessionId) { throw "No cooking sessionId returned" }
    }
}

# ─── Summary ─────────────────────────────────────────────────────────────────
$totalMs = [int]((Get-Date) - $RunStart).TotalMilliseconds
$summaryColor = if ($FailCount -gt 0) { "Red" } else { "Green" }

Write-Out "`n============================================================" Cyan
Write-Out " Test Suite Completed  ($totalMs ms total)" Cyan
Write-Out " Passed : $PassCount" Green
Write-Out " Failed : $FailCount" $summaryColor
Write-Out "============================================================`n" Cyan

# ─── Structured result table ─────────────────────────────────────────────────
Write-Out "`n--- Result Table ---" Gray
$Results | Format-Table -AutoSize | Out-String | ForEach-Object { Write-Out $_ Gray }

# ─── Write CSV for CI / spreadsheet import ───────────────────────────────────
if ($OutFile) {
    $csvPath = [System.IO.Path]::ChangeExtension($OutFile, ".csv")
    $Results | Export-Csv -Path $csvPath -NoTypeInformation
    Write-Out "Log  saved: $OutFile"  Cyan
    Write-Out "CSV  saved: $csvPath"  Cyan
}

# Return non-zero exit code when any test failed (useful for CI pipelines)
if ($FailCount -gt 0) { exit 1 }
