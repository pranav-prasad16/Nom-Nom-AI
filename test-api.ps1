# ==============================================================================
# Nom Nom AI - End-to-End API Test Suite
# ==============================================================================
# Usage:
#   .\test-api.ps1
#   .\test-api.ps1 -BaseUrl "http://172.28.233.147:3000"
# ==============================================================================

param (
    [string]$BaseUrl = "http://172.28.233.147:3000"
)

$ErrorActionPreference = "Stop"

$PassCount = 0
$FailCount = 0

function Run-Test {
    param (
        [string]$Name,
        [scriptblock]$Script
    )
    Write-Host -NoNewline "  [$Name] ... "
    try {
        & $Script
        Write-Host "PASSED" -ForegroundColor Green
        $script:PassCount++
    } catch {
        Write-Host "FAILED" -ForegroundColor Red
        Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor DarkRed
        $script:FailCount++
    }
}

Write-Host "`n🚀 Starting Nom Nom AI API Test Suite against: $BaseUrl`n" -ForegroundColor Cyan

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
    # If no seeded ingredient found, search for anything or fallback
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
        Write-Host -NoNewline " (Skipped: no ingredients seeded) " -ForegroundColor Yellow
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

# ─── Test Summary ────────────────────────────────────────────────────────────
Write-Host "`n=================================================="
Write-Host " Test Suite Completed" -ForegroundColor Cyan
Write-Host " Passed: $PassCount" -ForegroundColor Green
Write-Host " Failed: $FailCount" -ForegroundColor $(if ($FailCount -gt 0) { "Red" } else { "Green" })
Write-Host "==================================================`n"
