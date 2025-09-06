#!/bin/bash

# CurioLab Deployment Script for DigitalOcean
set -e

echo "🔬 Deploying CurioLab to DigitalOcean..."

# Pull latest code
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# Copy environment variables
echo "⚙️  Setting up environment variables..."
cp .env.production .env

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# Build and start services
echo "🏗️  Building and starting services..."
docker-compose up -d --build

# Health check
echo "🏥 Running health checks..."
sleep 30

# Check backend health
if curl -f http://localhost:8000/ > /dev/null 2>&1; then
    echo "✅ Backend is healthy"
else
    echo "❌ Backend health check failed"
    exit 1
fi

# Check frontend health
if curl -f http://localhost:3000/ > /dev/null 2>&1; then
    echo "✅ Frontend is healthy"
else
    echo "❌ Frontend health check failed"
    exit 1
fi

echo "🎉 CurioLab deployment completed successfully!"
echo "🌐 Visit: https://curiolab.app"