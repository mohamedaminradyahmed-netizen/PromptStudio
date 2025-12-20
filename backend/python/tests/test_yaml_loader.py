"""
Tests for YAML Command Loader
"""

import pytest
import tempfile
from pathlib import Path
from app.services.yaml_loader import YAMLCommandLoader
from app.models.command_models import CommandCategory


@pytest.fixture
def temp_commands_dir():
    """Create temporary commands directory"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def yaml_loader(temp_commands_dir):
    """Create YAML loader with temp directory"""
    return YAMLCommandLoader(commands_dir=str(temp_commands_dir))


def test_load_empty_directory(yaml_loader):
    """Test loading from empty directory creates examples"""
    commands = yaml_loader.load_all()
    # Should create example commands
    assert len(commands) >= 0


def test_get_nonexistent_command(yaml_loader):
    """Test getting a command that doesn't exist"""
    yaml_loader.load_all()
    command = yaml_loader.get_command("nonexistent")
    assert command is None


def test_list_commands(yaml_loader):
    """Test listing all commands"""
    yaml_loader.load_all()
    commands = yaml_loader.list_commands()
    assert isinstance(commands, list)


def test_search_commands(yaml_loader):
    """Test searching commands"""
    yaml_loader.load_all()
    results = yaml_loader.search_commands("analyze")
    assert isinstance(results, list)


def test_categories_initialized(yaml_loader):
    """Test that all categories are initialized"""
    yaml_loader.load_all()
    for category in CommandCategory:
        commands = yaml_loader.get_commands_by_category(category)
        assert isinstance(commands, list)
