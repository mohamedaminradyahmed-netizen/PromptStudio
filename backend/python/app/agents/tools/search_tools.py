"""
Search tools for agents.

Provides web search and semantic search capabilities.
"""

from typing import Any

from loguru import logger

try:
    from duckduckgo_search import DDGS
    DDGS_AVAILABLE = True
except ImportError:
    DDGS_AVAILABLE = False
    logger.warning("duckduckgo-search not installed. Web search will be unavailable.")


async def web_search(
    query: str,
    max_results: int = 5,
    region: str = "wt-wt",
    safesearch: str = "moderate",
) -> list[dict[str, Any]]:
    """
    Perform a web search using DuckDuckGo.

    Args:
        query: The search query
        max_results: Maximum number of results to return
        region: Region for search results (default: worldwide)
        safesearch: Safe search level (off, moderate, strict)

    Returns:
        List of search results with title, href, and body
    """
    if not DDGS_AVAILABLE:
        logger.error("DuckDuckGo search not available")
        return [{
            "title": "Search Unavailable",
            "href": "",
            "body": "Web search is not available. Please install duckduckgo-search."
        }]

    try:
        logger.info(f"Performing web search for: {query}")

        with DDGS() as ddgs:
            results = list(ddgs.text(
                query,
                max_results=max_results,
                region=region,
                safesearch=safesearch,
            ))

        logger.info(f"Found {len(results)} results for query: {query}")
        return results

    except Exception as e:
        logger.error(f"Web search error: {e}")
        return [{
            "title": "Search Error",
            "href": "",
            "body": f"An error occurred during search: {str(e)}"
        }]


async def semantic_search(
    query: str,
    collection: str = "prompts",
    limit: int = 5,
    threshold: float = 0.7,
) -> list[dict[str, Any]]:
    """
    Perform semantic search against a vector database.

    This is a placeholder that integrates with the existing
    RAG/vector search infrastructure in the Node.js backend.

    Args:
        query: The search query
        collection: Collection to search in
        limit: Maximum number of results
        threshold: Minimum similarity threshold

    Returns:
        List of semantically similar results
    """
    logger.info(f"Performing semantic search for: {query} in collection: {collection}")

    # TODO: Integrate with Node.js VectorService via WebSocket bridge
    # For now, return a placeholder indicating the capability
    return [{
        "id": "placeholder",
        "content": f"Semantic search for '{query}' in '{collection}'",
        "score": 0.0,
        "metadata": {
            "note": "Semantic search requires integration with VectorService"
        }
    }]


def format_search_results(results: list[dict[str, Any]], search_type: str = "web") -> str:
    """
    Format search results into a readable string for agents.

    Args:
        results: List of search results
        search_type: Type of search (web or semantic)

    Returns:
        Formatted string of results
    """
    if not results:
        return "No results found."

    formatted = []
    for i, result in enumerate(results, 1):
        if search_type == "web":
            formatted.append(
                f"{i}. **{result.get('title', 'No Title')}**\n"
                f"   URL: {result.get('href', 'N/A')}\n"
                f"   {result.get('body', 'No description')}\n"
            )
        else:
            formatted.append(
                f"{i}. Score: {result.get('score', 0):.2f}\n"
                f"   {result.get('content', 'No content')}\n"
            )

    return "\n".join(formatted)
