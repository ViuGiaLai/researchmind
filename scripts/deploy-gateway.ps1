# Deploy ResearchMind Cloud Gateway to Render
param(
    [string]$Action = "deploy"
)

$ErrorActionPreference = "Stop"

function Deploy-Gateway {
    Write-Host "=== Deploying ResearchMind Cloud Gateway ===" -ForegroundColor Cyan

    # Check Render CLI
    $renderCli = Get-Command "render" -ErrorAction SilentlyContinue
    if (-not $renderCli) {
        Write-Host "Render CLI not found. Install with: npm i -g @renderinc/cli" -ForegroundColor Yellow
        Write-Host "Then authenticate: render login" -ForegroundColor Yellow
        exit 1
    }

    # Build and deploy
    Write-Host "Building and deploying cloud_gateway..." -ForegroundColor Green
    render deploy --dockerfile ./cloud_gateway/Dockerfile --context .
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Deployment failed!" -ForegroundColor Red
        exit 1
    }

    Write-Host "Gateway deployed successfully!" -ForegroundColor Cyan
    Write-Host "Update backend/gateway.json with the production URL" -ForegroundColor Yellow
}

function Test-Local {
    Write-Host "=== Testing Cloud Gateway Locally ===" -ForegroundColor Cyan

    $envFile = Join-Path $PSScriptRoot "..\cloud_gateway\.env"
    if (-not (Test-Path $envFile)) {
        Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
        Copy-Item (Join-Path $PSScriptRoot "..\cloud_gateway\.env.example") $envFile
        Write-Host "Edit cloud_gateway/.env with your API keys before testing" -ForegroundColor Yellow
    }

    Write-Host "Starting gateway on http://localhost:8766..." -ForegroundColor Green
    uvicorn cloud_gateway.main:app --host 0.0.0.0 --port 8766 --reload
}

switch ($Action.ToLower()) {
    "deploy" { Deploy-Gateway }
    "test"   { Test-Local }
    default  { Write-Host "Usage: .\deploy-gateway.ps1 [-Action deploy|test]" }
}
