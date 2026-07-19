#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-deploy}"

deploy_gateway() {
    echo "=== Deploying ResearchMind Cloud Gateway ==="

    if ! command -v render &> /dev/null; then
        echo "Install Render CLI: npm i -g @renderinc/cli && render login"
        exit 1
    fi

    echo "Deploying cloud_gateway..."
    render deploy --dockerfile ./cloud_gateway/Dockerfile --context .
    echo "Gateway deployed!"
    echo "Update backend/gateway.json with the production URL"
}

test_local() {
    echo "=== Testing Cloud Gateway Locally ==="

    if [ ! -f cloud_gateway/.env ]; then
        echo "Creating .env from .env.example..."
        cp cloud_gateway/.env.example cloud_gateway/.env
        echo "Edit cloud_gateway/.env with your API keys"
    fi

    echo "Starting gateway on http://localhost:8766..."
    uvicorn cloud_gateway.main:app --host 0.0.0.0 --port 8766 --reload
}

case "$ACTION" in
    deploy) deploy_gateway ;;
    test)   test_local ;;
    *)      echo "Usage: $0 [deploy|test]" ;;
esac
