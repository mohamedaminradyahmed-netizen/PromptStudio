"""
API Tests for PromptStudio Python Backend
"""

import pytest
from httpx import AsyncClient
from app.main import app


@pytest.fixture
async def client():
    """Create async test client"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Test health check endpoint"""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient):
    """Test root endpoint"""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "service" in data
    assert "version" in data
    assert "status" in data


@pytest.mark.asyncio
async def test_list_commands(client: AsyncClient):
    """Test list commands endpoint"""
    response = await client.get("/api/commands")
    assert response.status_code == 200
    data = response.json()
    assert "commands" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_list_categories(client: AsyncClient):
    """Test list categories endpoint"""
    response = await client.get("/api/commands/categories/list")
    assert response.status_code == 200
    data = response.json()
    assert "categories" in data
    assert len(data["categories"]) > 0


@pytest.mark.asyncio
async def test_search_commands(client: AsyncClient):
    """Test search commands endpoint"""
    response = await client.post(
        "/api/commands/search",
        json={"query": "analyze"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert "total" in data
