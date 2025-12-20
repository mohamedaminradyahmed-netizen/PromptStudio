"""
Template API endpoints

Manage and render prompt templates with inheritance,
variables, and versioning.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ...services.template_service import (
    TemplateService,
    PromptTemplate,
    TemplateVariable,
    TemplateType,
    VariableType,
    RenderResult,
    TemplateMetadata,
)

router = APIRouter(prefix="/templates", tags=["Templates"])

# Service instance
template_service = TemplateService()


# Request/Response models

class VariableRequest(BaseModel):
    """Variable definition for request"""
    name: str
    type: str = "string"
    description: Optional[str] = None
    required: bool = True
    default: Optional[Any] = None
    choices: Optional[List[Any]] = None
    validation_regex: Optional[str] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None


class CreateTemplateRequest(BaseModel):
    """Request to create a template"""
    id: str
    name: str
    description: str
    content: str
    variables: List[VariableRequest] = Field(default_factory=list)
    extends: Optional[str] = None
    includes: List[str] = Field(default_factory=list)
    type: str = "base"
    system_prompt: Optional[str] = None
    output_format: Optional[str] = None
    examples: List[Dict[str, Any]] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    category: Optional[str] = None


class RenderTemplateRequest(BaseModel):
    """Request to render a template"""
    template_id: str
    variables: Dict[str, Any] = Field(default_factory=dict)
    validate: bool = True


class RenderInlineRequest(BaseModel):
    """Request to render inline template"""
    content: str
    system_prompt: Optional[str] = None
    variables: Dict[str, Any] = Field(default_factory=dict)


class SearchTemplatesRequest(BaseModel):
    """Request to search templates"""
    query: Optional[str] = None
    tags: Optional[List[str]] = None
    category: Optional[str] = None


class CreateVariantRequest(BaseModel):
    """Request to create a template variant"""
    base_template_id: str
    variant_id: str
    name: str
    modifications: Dict[str, Any] = Field(default_factory=dict)


@router.post("/create", response_model=Dict[str, str])
async def create_template(request: CreateTemplateRequest):
    """
    Create a new prompt template

    Templates support:
    - Variable placeholders: {{variable}}
    - Inheritance: extends other templates
    - Includes: embed other templates
    - Conditionals: {% if var %} ... {% endif %}
    - Loops: {% for item in list %} ... {% endfor %}
    """
    try:
        variables = [
            TemplateVariable(
                name=v.name,
                type=VariableType(v.type),
                description=v.description,
                required=v.required,
                default=v.default,
                choices=v.choices,
                validation_regex=v.validation_regex,
                min_length=v.min_length,
                max_length=v.max_length,
            )
            for v in request.variables
        ]

        metadata = TemplateMetadata(
            tags=request.tags,
            category=request.category,
        )

        template = PromptTemplate(
            id=request.id,
            name=request.name,
            description=request.description,
            content=request.content,
            variables=variables,
            extends=request.extends,
            includes=request.includes,
            type=TemplateType(request.type),
            system_prompt=request.system_prompt,
            output_format=request.output_format,
            examples=request.examples,
            metadata=metadata,
        )

        template_service.save_template(template)

        return {
            "status": "created",
            "template_id": template.id,
            "hash": template.get_hash(),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/render", response_model=RenderResult)
async def render_template(request: RenderTemplateRequest):
    """
    Render a template with variables

    Resolves inheritance, includes, and variable substitution.
    """
    try:
        result = template_service.render(
            template_id=request.template_id,
            variables=request.variables,
            validate=request.validate,
        )

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/render/inline")
async def render_inline(request: RenderInlineRequest):
    """
    Render an inline template without saving

    Useful for testing templates before saving.
    """
    try:
        # Create temporary template
        temp_template = PromptTemplate(
            id="_inline_temp",
            name="Inline Template",
            description="Temporary inline template",
            content=request.content,
            system_prompt=request.system_prompt,
        )

        # Manually render
        rendered_content = template_service._render_content(
            request.content,
            request.variables,
        )

        rendered_system = None
        if request.system_prompt:
            rendered_system = template_service._render_content(
                request.system_prompt,
                request.variables,
            )

        return {
            "rendered_content": rendered_content,
            "rendered_system": rendered_system,
            "variables_provided": list(request.variables.keys()),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_templates():
    """List all available templates"""
    templates = template_service.list_templates()
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "type": t.type.value,
            "extends": t.extends,
            "tags": t.metadata.tags,
            "category": t.metadata.category,
            "variable_count": len(t.variables),
        }
        for t in templates
    ]


@router.post("/search")
async def search_templates(request: SearchTemplatesRequest):
    """Search templates by query, tags, or category"""
    try:
        results = template_service.search_templates(
            query=request.query or "",
            tags=request.tags,
            category=request.category,
        )

        return [
            {
                "id": t.id,
                "name": t.name,
                "description": t.description,
                "type": t.type.value,
                "tags": t.metadata.tags,
            }
            for t in results
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{template_id}")
async def get_template(template_id: str):
    """Get a template by ID"""
    template = template_service.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")

    return template.model_dump()


@router.delete("/{template_id}")
async def delete_template(template_id: str):
    """Delete a template"""
    success = template_service.delete_template(template_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")

    return {"status": "deleted", "template_id": template_id}


@router.post("/variant", response_model=Dict[str, str])
async def create_variant(request: CreateVariantRequest):
    """
    Create a variant of an existing template

    Variants inherit from the base template and can
    override specific properties.
    """
    try:
        variant = template_service.create_variant(
            base_template_id=request.base_template_id,
            variant_id=request.variant_id,
            name=request.name,
            modifications=request.modifications,
        )

        return {
            "status": "created",
            "variant_id": variant.id,
            "base_template_id": request.base_template_id,
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reload")
async def reload_templates():
    """Reload all templates from disk"""
    template_service.reload()
    return {
        "status": "reloaded",
        "template_count": len(template_service._templates),
    }


@router.get("/{template_id}/variables")
async def get_template_variables(template_id: str):
    """Get variables required by a template"""
    template = template_service.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")

    return [
        {
            "name": v.name,
            "type": v.type.value,
            "description": v.description,
            "required": v.required,
            "default": v.default,
            "choices": v.choices,
        }
        for v in template.variables
    ]


@router.get("/{template_id}/preview")
async def preview_template(template_id: str):
    """
    Preview a template with example values

    Returns the template rendered with its default/example values.
    """
    template = template_service.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")

    # Build example variables
    example_vars = {}
    for var in template.variables:
        if var.default is not None:
            example_vars[var.name] = var.default
        elif var.choices:
            example_vars[var.name] = var.choices[0]
        else:
            example_vars[var.name] = f"<{var.name}>"

    # Also check examples
    if template.examples and len(template.examples) > 0:
        example_vars.update(template.examples[0].get("input", {}))

    try:
        result = template_service.render(
            template_id=template_id,
            variables=example_vars,
            validate=False,
        )

        return {
            "template_id": template_id,
            "preview": result.rendered_content,
            "system_prompt": result.rendered_system,
            "example_variables": example_vars,
        }

    except Exception as e:
        return {
            "template_id": template_id,
            "preview": template.content,
            "error": str(e),
        }
