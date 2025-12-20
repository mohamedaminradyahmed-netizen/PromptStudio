"""
Template Service

Advanced prompt template management with inheritance, composition,
versioning, and variable validation.
"""

import re
import hashlib
from datetime import datetime
from typing import Optional, List, Dict, Any, Set
from enum import Enum
from pathlib import Path
from ruamel.yaml import YAML
from pydantic import BaseModel, Field
from loguru import logger

from ..core.config import settings


class TemplateType(str, Enum):
    """Types of prompt templates"""
    BASE = "base"
    COMPOSITE = "composite"
    VARIANT = "variant"
    CHAIN = "chain"


class VariableType(str, Enum):
    """Variable types for template parameters"""
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    LIST = "list"
    OBJECT = "object"
    ENUM = "enum"


class TemplateVariable(BaseModel):
    """Variable definition for a template"""
    name: str
    type: VariableType = VariableType.STRING
    description: Optional[str] = None
    required: bool = True
    default: Optional[Any] = None
    choices: Optional[List[Any]] = None  # For enum type
    validation_regex: Optional[str] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None


class TemplateMetadata(BaseModel):
    """Metadata for a template"""
    author: Optional[str] = None
    version: str = "1.0.0"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    tags: List[str] = Field(default_factory=list)
    category: Optional[str] = None
    language: str = "en"
    usage_count: int = 0
    rating: Optional[float] = None


class PromptTemplate(BaseModel):
    """
    Advanced prompt template with inheritance and composition

    Features:
    - Template inheritance (extends)
    - Composition (includes other templates)
    - Variable validation
    - Versioning
    - Conditional sections
    """
    id: str = Field(description="Unique template identifier")
    name: str
    description: str
    content: str = Field(description="Template content with {{variable}} placeholders")
    variables: List[TemplateVariable] = Field(default_factory=list)
    extends: Optional[str] = Field(default=None, description="Parent template ID to extend")
    includes: List[str] = Field(default_factory=list, description="IDs of templates to include")
    type: TemplateType = TemplateType.BASE
    system_prompt: Optional[str] = None
    output_format: Optional[str] = Field(default=None, description="Expected output format")
    examples: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: TemplateMetadata = Field(default_factory=TemplateMetadata)

    def get_hash(self) -> str:
        """Generate hash of template content"""
        content = f"{self.content}:{self.system_prompt or ''}"
        return hashlib.md5(content.encode()).hexdigest()[:8]


class RenderResult(BaseModel):
    """Result of template rendering"""
    rendered_content: str
    rendered_system: Optional[str] = None
    variables_used: List[str]
    missing_variables: List[str]
    template_id: str
    template_version: str


class TemplateService:
    """
    Service for managing and rendering prompt templates

    Features:
    - Template CRUD operations
    - Template inheritance and composition
    - Variable validation
    - Hot-reload from YAML files
    - Template versioning
    - Conditional rendering
    """

    def __init__(self, templates_dir: Optional[str] = None):
        self.templates_dir = Path(templates_dir or settings.commands_directory).parent / "templates"
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self._templates: Dict[str, PromptTemplate] = {}
        self._versions: Dict[str, List[PromptTemplate]] = {}
        self._load_templates()

    def _load_templates(self) -> None:
        """Load all templates from the templates directory"""
        if not self.templates_dir.exists():
            self.templates_dir.mkdir(parents=True, exist_ok=True)
            self._create_example_templates()
            return

        for yaml_file in self.templates_dir.glob("**/*.yaml"):
            self._load_template_file(yaml_file)

        logger.info(f"Loaded {len(self._templates)} templates from {self.templates_dir}")

    def _load_template_file(self, file_path: Path) -> None:
        """Load a template from a YAML file"""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = self.yaml.load(f)

            if data is None:
                return

            # Handle single template or list
            templates = [data] if isinstance(data, dict) else data

            for tmpl_data in templates:
                try:
                    # Convert variables to TemplateVariable objects
                    if "variables" in tmpl_data:
                        tmpl_data["variables"] = [
                            TemplateVariable(**v) if isinstance(v, dict) else v
                            for v in tmpl_data["variables"]
                        ]

                    # Convert metadata
                    if "metadata" in tmpl_data and isinstance(tmpl_data["metadata"], dict):
                        tmpl_data["metadata"] = TemplateMetadata(**tmpl_data["metadata"])

                    template = PromptTemplate(**tmpl_data)
                    self._templates[template.id] = template

                    # Track versions
                    if template.id not in self._versions:
                        self._versions[template.id] = []
                    self._versions[template.id].append(template)

                    logger.debug(f"Loaded template: {template.id}")
                except Exception as e:
                    logger.error(f"Invalid template in {file_path}: {e}")

        except Exception as e:
            logger.error(f"Failed to load {file_path}: {e}")

    def _create_example_templates(self) -> None:
        """Create example template files"""
        examples = [
            {
                "id": "base-analysis",
                "name": "Base Analysis Template",
                "description": "Base template for prompt analysis",
                "type": "base",
                "content": """Analyze the following prompt and provide detailed feedback.

Prompt to analyze:
{{prompt}}

{% if context %}
Context: {{context}}
{% endif %}

Provide your analysis covering:
1. Clarity and readability
2. Specificity and detail level
3. Potential improvements""",
                "variables": [
                    {"name": "prompt", "type": "string", "required": True, "description": "Prompt to analyze"},
                    {"name": "context", "type": "string", "required": False, "description": "Optional context"},
                ],
                "system_prompt": "You are an expert prompt engineer.",
                "metadata": {
                    "author": "PromptStudio",
                    "version": "1.0.0",
                    "tags": ["analysis", "base"],
                },
            },
            {
                "id": "detailed-analysis",
                "name": "Detailed Analysis",
                "description": "Extended analysis with scoring",
                "type": "variant",
                "extends": "base-analysis",
                "content": """{{super}}

Additionally, score the prompt on these dimensions (0-10):
- Clarity: How clear is the prompt?
- Specificity: How specific are the instructions?
- Effectiveness: How likely to achieve desired outcome?

Provide concrete suggestions for improvement.""",
                "metadata": {
                    "author": "PromptStudio",
                    "version": "1.0.0",
                    "tags": ["analysis", "detailed"],
                },
            },
            {
                "id": "creative-writing",
                "name": "Creative Writing Prompt",
                "description": "Template for creative writing tasks",
                "type": "base",
                "content": """Write a {{genre}} story about {{topic}}.

Requirements:
- Length: {{length}} words
- Tone: {{tone}}
- Include: {{elements}}

{% if style_reference %}
Write in the style of: {{style_reference}}
{% endif %}""",
                "variables": [
                    {"name": "genre", "type": "enum", "choices": ["fantasy", "sci-fi", "mystery", "romance", "thriller"]},
                    {"name": "topic", "type": "string", "required": True},
                    {"name": "length", "type": "number", "default": 500},
                    {"name": "tone", "type": "string", "default": "engaging"},
                    {"name": "elements", "type": "list", "default": []},
                    {"name": "style_reference", "type": "string", "required": False},
                ],
                "system_prompt": "You are a creative writer with expertise in multiple genres.",
                "metadata": {
                    "author": "PromptStudio",
                    "version": "1.0.0",
                    "tags": ["creative", "writing"],
                },
            },
            {
                "id": "code-review",
                "name": "Code Review Template",
                "description": "Template for code review requests",
                "type": "base",
                "content": """Review the following {{language}} code:

```{{language}}
{{code}}
```

Focus on:
{% for focus in focus_areas %}
- {{focus}}
{% endfor %}

Provide:
1. Issues found (with severity: low/medium/high/critical)
2. Suggestions for improvement
3. Best practices recommendations""",
                "variables": [
                    {"name": "language", "type": "string", "required": True},
                    {"name": "code", "type": "string", "required": True},
                    {"name": "focus_areas", "type": "list", "default": ["bugs", "performance", "readability"]},
                ],
                "system_prompt": "You are a senior software engineer conducting a thorough code review.",
                "metadata": {
                    "author": "PromptStudio",
                    "version": "1.0.0",
                    "tags": ["code", "review", "development"],
                },
            },
        ]

        for example in examples:
            file_path = self.templates_dir / f"{example['id']}.yaml"
            with open(file_path, "w", encoding="utf-8") as f:
                self.yaml.dump(example, f)

        logger.info(f"Created {len(examples)} example templates")
        self._load_templates()

    def get_template(self, template_id: str) -> Optional[PromptTemplate]:
        """Get a template by ID"""
        return self._templates.get(template_id)

    def list_templates(self) -> List[PromptTemplate]:
        """List all templates"""
        return list(self._templates.values())

    def search_templates(
        self,
        query: str,
        tags: Optional[List[str]] = None,
        category: Optional[str] = None,
    ) -> List[PromptTemplate]:
        """
        Search templates by query, tags, or category

        Args:
            query: Search query for name/description
            tags: Filter by tags
            category: Filter by category

        Returns:
            Matching templates
        """
        results = []
        query_lower = query.lower() if query else ""

        for template in self._templates.values():
            # Query match
            if query_lower:
                name_match = query_lower in template.name.lower()
                desc_match = query_lower in template.description.lower()
                if not (name_match or desc_match):
                    continue

            # Tag filter
            if tags:
                if not any(t in template.metadata.tags for t in tags):
                    continue

            # Category filter
            if category and template.metadata.category != category:
                continue

            results.append(template)

        return results

    def render(
        self,
        template_id: str,
        variables: Dict[str, Any],
        validate: bool = True,
    ) -> RenderResult:
        """
        Render a template with variables

        Args:
            template_id: Template ID to render
            variables: Variable values
            validate: Whether to validate variables

        Returns:
            RenderResult with rendered content
        """
        template = self.get_template(template_id)
        if not template:
            raise ValueError(f"Template not found: {template_id}")

        # Resolve inheritance
        resolved_content, resolved_system = self._resolve_inheritance(template)

        # Resolve includes
        resolved_content = self._resolve_includes(resolved_content)

        # Validate variables if requested
        missing = []
        if validate:
            missing = self._validate_variables(template, variables)

        # Render content
        rendered_content = self._render_content(resolved_content, variables)
        rendered_system = self._render_content(resolved_system, variables) if resolved_system else None

        # Extract used variables
        used_vars = self._extract_variables(template.content)

        return RenderResult(
            rendered_content=rendered_content,
            rendered_system=rendered_system,
            variables_used=list(used_vars),
            missing_variables=missing,
            template_id=template.id,
            template_version=template.metadata.version,
        )

    def _resolve_inheritance(
        self,
        template: PromptTemplate,
    ) -> tuple[str, Optional[str]]:
        """Resolve template inheritance chain"""
        if not template.extends:
            return template.content, template.system_prompt

        # Get parent template
        parent = self.get_template(template.extends)
        if not parent:
            logger.warning(f"Parent template not found: {template.extends}")
            return template.content, template.system_prompt

        # Recursively resolve parent
        parent_content, parent_system = self._resolve_inheritance(parent)

        # Replace {{super}} with parent content
        content = template.content.replace("{{super}}", parent_content)

        # Merge system prompts
        system = template.system_prompt
        if not system and parent_system:
            system = parent_system
        elif system and parent_system:
            system = f"{parent_system}\n\n{system}"

        return content, system

    def _resolve_includes(self, content: str) -> str:
        """Resolve template includes"""
        include_pattern = r'\{\{\s*include\s*"([^"]+)"\s*\}\}'

        def replace_include(match):
            include_id = match.group(1)
            included_template = self.get_template(include_id)
            if included_template:
                return included_template.content
            logger.warning(f"Included template not found: {include_id}")
            return ""

        return re.sub(include_pattern, replace_include, content)

    def _validate_variables(
        self,
        template: PromptTemplate,
        variables: Dict[str, Any],
    ) -> List[str]:
        """Validate variables against template requirements"""
        missing = []

        for var_def in template.variables:
            value = variables.get(var_def.name)

            # Check required
            if var_def.required and value is None:
                if var_def.default is None:
                    missing.append(var_def.name)
                continue

            if value is None:
                continue

            # Type validation
            if var_def.type == VariableType.NUMBER:
                if not isinstance(value, (int, float)):
                    raise ValueError(f"Variable '{var_def.name}' must be a number")

            elif var_def.type == VariableType.BOOLEAN:
                if not isinstance(value, bool):
                    raise ValueError(f"Variable '{var_def.name}' must be a boolean")

            elif var_def.type == VariableType.LIST:
                if not isinstance(value, list):
                    raise ValueError(f"Variable '{var_def.name}' must be a list")

            elif var_def.type == VariableType.ENUM:
                if var_def.choices and value not in var_def.choices:
                    raise ValueError(
                        f"Variable '{var_def.name}' must be one of: {var_def.choices}"
                    )

            elif var_def.type == VariableType.STRING:
                if not isinstance(value, str):
                    value = str(value)

                if var_def.min_length and len(value) < var_def.min_length:
                    raise ValueError(
                        f"Variable '{var_def.name}' must be at least {var_def.min_length} characters"
                    )

                if var_def.max_length and len(value) > var_def.max_length:
                    raise ValueError(
                        f"Variable '{var_def.name}' must be at most {var_def.max_length} characters"
                    )

                if var_def.validation_regex:
                    if not re.match(var_def.validation_regex, value):
                        raise ValueError(
                            f"Variable '{var_def.name}' does not match pattern: {var_def.validation_regex}"
                        )

        return missing

    def _render_content(
        self,
        content: str,
        variables: Dict[str, Any],
    ) -> str:
        """Render template content with variables"""
        rendered = content

        # Handle conditional blocks {% if var %} ... {% endif %}
        rendered = self._render_conditionals(rendered, variables)

        # Handle for loops {% for item in list %} ... {% endfor %}
        rendered = self._render_loops(rendered, variables)

        # Replace simple variables {{var}}
        for key, value in variables.items():
            if isinstance(value, list):
                value = ", ".join(str(v) for v in value)
            rendered = rendered.replace(f"{{{{{key}}}}}", str(value))

        # Remove unreplaced optional variables
        rendered = re.sub(r'\{\{[^}]+\}\}', '', rendered)

        return rendered.strip()

    def _render_conditionals(
        self,
        content: str,
        variables: Dict[str, Any],
    ) -> str:
        """Render conditional blocks"""
        pattern = r'\{%\s*if\s+(\w+)\s*%\}(.*?)\{%\s*endif\s*%\}'

        def replace_conditional(match):
            var_name = match.group(1)
            block_content = match.group(2)
            if variables.get(var_name):
                return block_content
            return ""

        return re.sub(pattern, replace_conditional, content, flags=re.DOTALL)

    def _render_loops(
        self,
        content: str,
        variables: Dict[str, Any],
    ) -> str:
        """Render for loop blocks"""
        pattern = r'\{%\s*for\s+(\w+)\s+in\s+(\w+)\s*%\}(.*?)\{%\s*endfor\s*%\}'

        def replace_loop(match):
            item_name = match.group(1)
            list_name = match.group(2)
            loop_content = match.group(3)

            items = variables.get(list_name, [])
            if not isinstance(items, list):
                return ""

            result = []
            for item in items:
                item_rendered = loop_content.replace(f"{{{{{item_name}}}}}", str(item))
                result.append(item_rendered)

            return "\n".join(result)

        return re.sub(pattern, replace_loop, content, flags=re.DOTALL)

    def _extract_variables(self, content: str) -> Set[str]:
        """Extract variable names from template content"""
        pattern = r'\{\{(\w+)\}\}'
        return set(re.findall(pattern, content))

    def save_template(self, template: PromptTemplate) -> None:
        """Save a template to a YAML file"""
        file_path = self.templates_dir / f"{template.id}.yaml"

        # Update metadata
        template.metadata.updated_at = datetime.now()
        if template.metadata.created_at is None:
            template.metadata.created_at = datetime.now()

        data = template.model_dump(exclude_none=True)

        with open(file_path, "w", encoding="utf-8") as f:
            self.yaml.dump(data, f)

        self._templates[template.id] = template
        logger.info(f"Saved template: {template.id}")

    def delete_template(self, template_id: str) -> bool:
        """Delete a template"""
        if template_id not in self._templates:
            return False

        file_path = self.templates_dir / f"{template_id}.yaml"
        if file_path.exists():
            file_path.unlink()

        del self._templates[template_id]
        logger.info(f"Deleted template: {template_id}")
        return True

    def create_variant(
        self,
        base_template_id: str,
        variant_id: str,
        name: str,
        modifications: Dict[str, Any],
    ) -> PromptTemplate:
        """
        Create a variant of an existing template

        Args:
            base_template_id: ID of template to extend
            variant_id: ID for the new variant
            name: Name for the variant
            modifications: Changes to apply

        Returns:
            New variant template
        """
        base = self.get_template(base_template_id)
        if not base:
            raise ValueError(f"Base template not found: {base_template_id}")

        variant_data = base.model_dump()
        variant_data.update({
            "id": variant_id,
            "name": name,
            "type": TemplateType.VARIANT,
            "extends": base_template_id,
            **modifications,
        })

        variant_data["metadata"] = TemplateMetadata(
            author=base.metadata.author,
            tags=base.metadata.tags + ["variant"],
        )

        variant = PromptTemplate(**variant_data)
        self.save_template(variant)

        return variant

    def reload(self) -> None:
        """Reload all templates from disk"""
        self._templates.clear()
        self._versions.clear()
        self._load_templates()
        logger.info("Reloaded all templates")
