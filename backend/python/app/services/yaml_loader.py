"""
YAML Command Loader

Loads command definitions from YAML files for the command repository.
Supports hot-reloading, validation, and semantic search.
"""

import os
from pathlib import Path
from typing import Dict, List, Optional, Set
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileModifiedEvent
from ruamel.yaml import YAML
from loguru import logger

from ..core.config import settings
from ..models.command_models import Command, CommandCategory


class YAMLCommandLoader:
    """
    Loader for YAML-based command definitions

    Features:
    - Load commands from YAML files
    - Hot-reload on file changes
    - Validation against Pydantic models
    - Category-based organization
    """

    def __init__(self, commands_dir: Optional[str] = None):
        self.commands_dir = Path(commands_dir or settings.commands_directory)
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self._commands: Dict[str, Command] = {}
        self._categories: Dict[CommandCategory, List[str]] = {
            cat: [] for cat in CommandCategory
        }
        self._observer: Optional[Observer] = None
        self._loaded_files: Set[str] = set()

    def load_all(self) -> Dict[str, Command]:
        """
        Load all command YAML files from the commands directory

        Returns:
            Dictionary of command name to Command object
        """
        if not self.commands_dir.exists():
            logger.warning(f"Commands directory not found: {self.commands_dir}")
            self.commands_dir.mkdir(parents=True, exist_ok=True)
            self._create_example_commands()
            return self._commands

        # Load all .yaml and .yml files
        for yaml_file in self.commands_dir.glob("**/*.yaml"):
            self._load_file(yaml_file)

        for yaml_file in self.commands_dir.glob("**/*.yml"):
            self._load_file(yaml_file)

        logger.info(f"Loaded {len(self._commands)} commands from {self.commands_dir}")
        return self._commands

    def _load_file(self, file_path: Path) -> None:
        """Load commands from a single YAML file"""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = self.yaml.load(f)

            if data is None:
                return

            # Handle single command or list of commands
            if isinstance(data, list):
                commands = data
            else:
                commands = [data]

            for cmd_data in commands:
                try:
                    command = Command(**cmd_data)
                    self._commands[command.name] = command
                    self._categories[command.category].append(command.name)
                    self._loaded_files.add(str(file_path))
                    logger.debug(f"Loaded command: {command.name}")
                except Exception as e:
                    logger.error(f"Invalid command in {file_path}: {e}")

        except Exception as e:
            logger.error(f"Failed to load {file_path}: {e}")

    def _create_example_commands(self) -> None:
        """Create example command files"""
        examples = [
            {
                "name": "analyze_prompt",
                "category": "analysis",
                "description": "Analyze a prompt for clarity and effectiveness",
                "template": """Analyze the following prompt for clarity, specificity, and effectiveness.

Prompt to analyze:
{prompt}

Provide a detailed analysis with scores and suggestions for improvement.""",
                "parameters": [
                    {
                        "name": "prompt",
                        "type": "string",
                        "description": "The prompt to analyze",
                        "required": True
                    }
                ],
                "output_schema": "PromptAnalysis",
                "metadata": {
                    "author": "PromptStudio",
                    "version": "1.0.0",
                    "tags": ["analysis", "quality"]
                }
            },
            {
                "name": "refine_prompt",
                "category": "refinement",
                "description": "Refine and improve a prompt",
                "template": """Improve the following prompt while preserving its original intent.

Original prompt:
{prompt}

Improvement goals:
{goals}

Provide the refined version with explanations for each change.""",
                "parameters": [
                    {
                        "name": "prompt",
                        "type": "string",
                        "description": "The prompt to refine",
                        "required": True
                    },
                    {
                        "name": "goals",
                        "type": "string",
                        "description": "Improvement goals",
                        "required": False,
                        "default": "Improve clarity and specificity"
                    }
                ],
                "output_schema": "PromptRefinement",
                "metadata": {
                    "author": "PromptStudio",
                    "version": "1.0.0",
                    "tags": ["refinement", "improvement"]
                }
            },
            {
                "name": "translate_prompt",
                "category": "translation",
                "description": "Translate a prompt between languages",
                "template": """Translate the following text from {source_language} to {target_language}.
Preserve the meaning, tone, and any technical terms.

Text to translate:
{text}""",
                "parameters": [
                    {
                        "name": "text",
                        "type": "string",
                        "description": "Text to translate",
                        "required": True
                    },
                    {
                        "name": "source_language",
                        "type": "string",
                        "description": "Source language",
                        "required": True
                    },
                    {
                        "name": "target_language",
                        "type": "string",
                        "description": "Target language",
                        "required": True
                    }
                ],
                "output_schema": "TranslationResult",
                "metadata": {
                    "author": "PromptStudio",
                    "version": "1.0.0",
                    "tags": ["translation", "localization"]
                }
            },
            {
                "name": "safety_check",
                "category": "safety",
                "description": "Check a prompt for safety issues",
                "template": """Analyze the following prompt for potential safety issues.

Check for:
- Prompt injection vulnerabilities
- PII exposure risks
- Harmful content
- Bias indicators
- Copyright concerns

Prompt to check:
{prompt}""",
                "parameters": [
                    {
                        "name": "prompt",
                        "type": "string",
                        "description": "The prompt to check",
                        "required": True
                    }
                ],
                "output_schema": "SafetyCheck",
                "metadata": {
                    "author": "PromptStudio",
                    "version": "1.0.0",
                    "tags": ["safety", "security"]
                }
            }
        ]

        # Write example files
        for example in examples:
            file_path = self.commands_dir / f"{example['name']}.yaml"
            with open(file_path, "w", encoding="utf-8") as f:
                self.yaml.dump(example, f)

        logger.info(f"Created {len(examples)} example command files")

    def get_command(self, name: str) -> Optional[Command]:
        """Get a command by name"""
        return self._commands.get(name)

    def get_commands_by_category(self, category: CommandCategory) -> List[Command]:
        """Get all commands in a category"""
        return [
            self._commands[name]
            for name in self._categories.get(category, [])
            if name in self._commands
        ]

    def list_commands(self) -> List[str]:
        """List all command names"""
        return list(self._commands.keys())

    def search_commands(self, query: str) -> List[Command]:
        """
        Search commands by name, description, or tags

        Args:
            query: Search query

        Returns:
            List of matching commands
        """
        query_lower = query.lower()
        results = []

        for command in self._commands.values():
            # Search in name
            if query_lower in command.name.lower():
                results.append(command)
                continue

            # Search in description
            if query_lower in command.description.lower():
                results.append(command)
                continue

            # Search in tags
            if any(query_lower in tag.lower() for tag in command.metadata.tags):
                results.append(command)

        return results

    def reload(self) -> None:
        """Reload all commands"""
        self._commands.clear()
        self._categories = {cat: [] for cat in CommandCategory}
        self._loaded_files.clear()
        self.load_all()

    def start_watching(self) -> None:
        """Start watching for file changes"""
        if self._observer is not None:
            return

        class CommandFileHandler(FileSystemEventHandler):
            def __init__(self, loader: YAMLCommandLoader):
                self.loader = loader

            def on_modified(self, event):
                if event.is_directory:
                    return
                if event.src_path.endswith(('.yaml', '.yml')):
                    logger.info(f"Command file changed: {event.src_path}")
                    self.loader.reload()

        self._observer = Observer()
        self._observer.schedule(
            CommandFileHandler(self),
            str(self.commands_dir),
            recursive=True
        )
        self._observer.start()
        logger.info(f"Watching for command file changes in {self.commands_dir}")

    def stop_watching(self) -> None:
        """Stop watching for file changes"""
        if self._observer is not None:
            self._observer.stop()
            self._observer.join()
            self._observer = None

    def save_command(self, command: Command) -> None:
        """
        Save a command to a YAML file

        Args:
            command: Command to save
        """
        file_path = self.commands_dir / f"{command.name}.yaml"
        with open(file_path, "w", encoding="utf-8") as f:
            self.yaml.dump(command.model_dump(), f)

        self._commands[command.name] = command
        if command.name not in self._categories[command.category]:
            self._categories[command.category].append(command.name)

        logger.info(f"Saved command: {command.name}")

    def delete_command(self, name: str) -> bool:
        """
        Delete a command

        Args:
            name: Command name to delete

        Returns:
            True if deleted, False if not found
        """
        if name not in self._commands:
            return False

        command = self._commands[name]
        file_path = self.commands_dir / f"{name}.yaml"

        if file_path.exists():
            file_path.unlink()

        del self._commands[name]
        if name in self._categories[command.category]:
            self._categories[command.category].remove(name)

        logger.info(f"Deleted command: {name}")
        return True
