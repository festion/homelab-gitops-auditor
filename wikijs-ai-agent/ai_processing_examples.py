#!/usr/bin/env python3
"""
AI-Enhanced WikiJS MCP Server Usage Examples

This script demonstrates how to use the AI processing capabilities
of the WikiJS MCP server for document enhancement, categorization,
TOC generation, and more.
"""

import asyncio
import json
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def demonstrate_ai_processing():
    """Demonstrate AI processing capabilities."""
    
    print("🤖 WikiJS AI-Enhanced Document Processing Demo")
    print("=" * 60)
    
    # Example document content
    example_content = """
# API Authentication Guide

This document explains how to authenticate with our API.

Authentication is required for all API endpoints except public ones.

## Overview
Our API uses token-based authentication. You need to include your API key in the Authorization header.

## Getting Started
1. Sign up for an account
2. Generate an API key
3. Include the key in your requests

## Request Format
Include your API key like this:
Authorization: Bearer YOUR_API_KEY

## Error Handling
If authentication fails, you'll get a 401 error.

## Examples
Here's a curl example:
curl -H "Authorization: Bearer YOUR_KEY" https://api.example.com/data

## Troubleshooting
- Check your API key is correct
- Verify the token hasn't expired
- Ensure you have proper permissions
"""
    
    print("\n📝 Example Document Content:")
    print("-" * 30)
    print(example_content[:300] + "..." if len(example_content) > 300 else example_content)
    
    # Simulate AI processing results
    print("\n🚀 AI Processing Results:")
    print("-" * 30)
    
    # 1. Content Enhancement
    print("\n✨ Content Enhancement:")
    enhancement_result = {
        "enhanced_content": example_content.replace(
            "Authentication is required for all API endpoints except public ones.",
            "Authentication is required for all API endpoints except public ones. This ensures secure access to your data and prevents unauthorized usage."
        ),
        "improvements": [
            "Added clarification about security purpose",
            "Improved sentence structure in overview",
            "Enhanced error handling section with more details",
            "Added examples for better understanding"
        ],
        "quality_score": 0.85,
        "readability_score": 0.78,
        "confidence": 0.9
    }
    
    print(f"  Quality Score: {enhancement_result['quality_score']:.2f}")
    print(f"  Readability Score: {enhancement_result['readability_score']:.2f}")
    print(f"  Confidence: {enhancement_result['confidence']:.2f}")
    print("  Improvements:")
    for improvement in enhancement_result['improvements']:
        print(f"    • {improvement}")
    
    # 2. TOC Generation
    print("\n📑 Table of Contents Generation:")
    toc_result = {
        "sections": [
            {"level": 1, "title": "API Authentication Guide", "anchor": "#api-authentication-guide"},
            {"level": 2, "title": "Overview", "anchor": "#overview"},
            {"level": 2, "title": "Getting Started", "anchor": "#getting-started"},
            {"level": 2, "title": "Request Format", "anchor": "#request-format"},
            {"level": 2, "title": "Error Handling", "anchor": "#error-handling"},
            {"level": 2, "title": "Examples", "anchor": "#examples"},
            {"level": 2, "title": "Troubleshooting", "anchor": "#troubleshooting"}
        ],
        "depth": 2,
        "placement_suggestion": "after_introduction",
        "confidence": 0.9
    }
    
    print(f"  Sections Found: {len(toc_result['sections'])}")
    print(f"  Suggested Placement: {toc_result['placement_suggestion']}")
    print(f"  Confidence: {toc_result['confidence']:.2f}")
    print("  Generated TOC:")
    for section in toc_result['sections']:
        indent = "  " * (section['level'] - 1)
        print(f"    {indent}- [{section['title']}]({section['anchor']})")
    
    # 3. Document Categorization
    print("\n🏷️ Document Categorization:")
    categorization_result = {
        "primary_category": "technical",
        "secondary_categories": ["api", "authentication"],
        "tags": ["api", "authentication", "security", "documentation", "guide", "bearer-token"],
        "target_audience": "developers",
        "complexity_level": "intermediate",
        "confidence": 0.85,
        "related_documents": ["api-setup", "security-guide", "token-management"]
    }
    
    print(f"  Primary Category: {categorization_result['primary_category']}")
    print(f"  Secondary Categories: {', '.join(categorization_result['secondary_categories'])}")
    print(f"  Target Audience: {categorization_result['target_audience']}")
    print(f"  Complexity Level: {categorization_result['complexity_level']}")
    print(f"  Confidence: {categorization_result['confidence']:.2f}")
    print(f"  Suggested Tags: {', '.join(categorization_result['tags'])}")
    print(f"  Related Documents: {', '.join(categorization_result['related_documents'])}")
    
    # 4. Quality Assessment
    print("\n📊 Quality Assessment:")
    quality_result = {
        "grammar_score": 0.9,
        "readability_score": 0.8,
        "technical_accuracy_score": 0.95,
        "structure_score": 0.85,
        "overall_score": 0.875,
        "compliance_score": 0.9,
        "issues": [
            {"type": "structure", "description": "Consider adding more detailed examples", "suggestion": "Include multiple programming language examples"}
        ],
        "suggestions": [
            "Add more code examples in different programming languages",
            "Include rate limiting information",
            "Add section about token refresh procedures"
        ]
    }
    
    print(f"  Overall Score: {quality_result['overall_score']:.2f}/1.0")
    print("  Quality Metrics:")
    print(f"    Grammar: {quality_result['grammar_score']:.2f}")
    print(f"    Readability: {quality_result['readability_score']:.2f}")
    print(f"    Technical Accuracy: {quality_result['technical_accuracy_score']:.2f}")
    print(f"    Structure: {quality_result['structure_score']:.2f}")
    print(f"    Template Compliance: {quality_result['compliance_score']:.2f}")
    
    if quality_result['suggestions']:
        print("  Improvement Suggestions:")
        for suggestion in quality_result['suggestions']:
            print(f"    • {suggestion}")
    
    # 5. Cross-Document Links
    print("\n🔗 Cross-Document Link Detection:")
    link_result = {
        "suggested_links": [
            {"text": "API setup", "target_doc": "/technical/api-setup", "context": "initial configuration", "confidence": 0.8},
            {"text": "security guide", "target_doc": "/technical/security-guide", "context": "authentication methods", "confidence": 0.85}
        ],
        "broken_links": [],
        "external_references": [
            {"text": "OAuth 2.0 specification", "url": "https://oauth.net/2/", "needs_documentation": False}
        ],
        "confidence": 0.75
    }
    
    print(f"  Analysis Confidence: {link_result['confidence']:.2f}")
    if link_result['suggested_links']:
        print("  Suggested Internal Links:")
        for link in link_result['suggested_links']:
            print(f"    • '{link['text']}' → {link['target_doc']} (confidence: {link['confidence']:.2f})")
    
    if link_result['external_references']:
        print("  External References Found:")
        for ref in link_result['external_references']:
            print(f"    • {ref['text']}: {ref['url']}")
    
    # 6. Navigation Structure
    print("\n🧭 Navigation Structure Generation:")
    navigation_result = {
        "structure_type": "hierarchical",
        "categories": {
            "technical": [
                {"title": "API Authentication Guide", "path": "/technical/api-auth"},
                {"title": "API Setup Guide", "path": "/technical/api-setup"},
                {"title": "Security Guidelines", "path": "/technical/security"}
            ],
            "user": [
                {"title": "Getting Started", "path": "/user/getting-started"},
                {"title": "FAQ", "path": "/user/faq"}
            ]
        },
        "breadcrumbs": "Home > Technical > API Documentation > Authentication",
        "sitemap_generated": True
    }
    
    print(f"  Structure Type: {navigation_result['structure_type']}")
    print(f"  Categories Found: {len(navigation_result['categories'])}")
    print(f"  Example Breadcrumb: {navigation_result['breadcrumbs']}")
    print("  Category Structure:")
    for category, docs in navigation_result['categories'].items():
        print(f"    📂 {category.title()}")
        for doc in docs:
            print(f"      📄 [{doc['title']}]({doc['path']})")
    
    print("\n✅ AI Processing Demo Complete!")
    print("\n💡 Key Benefits:")
    print("  • Automatic content enhancement and grammar correction")
    print("  • Intelligent document categorization and tagging")
    print("  • Auto-generated table of contents with anchor links")
    print("  • Cross-document link detection and suggestions")
    print("  • Comprehensive quality assessment and recommendations")
    print("  • Smart navigation structure generation")
    print("  • Template compliance checking")
    print("  • Batch processing capabilities")
    print("  • Integration with Serena MCP for advanced AI processing")


async def demonstrate_batch_processing():
    """Demonstrate batch processing capabilities."""
    
    print("\n🚀 Batch Processing Demo")
    print("=" * 40)
    
    # Simulate batch processing results
    batch_result = {
        "documents_processed": 15,
        "successful": 13,
        "errors": 2,
        "processing_time": "2.5 minutes",
        "results": [
            {
                "path": "/docs/api-guide.md",
                "status": "success",
                "quality_score": 0.87,
                "category": "technical",
                "improvements": 4
            },
            {
                "path": "/docs/user-manual.md", 
                "status": "success",
                "quality_score": 0.82,
                "category": "user",
                "improvements": 6
            },
            {
                "path": "/docs/troubleshooting.md",
                "status": "success", 
                "quality_score": 0.79,
                "category": "operational",
                "improvements": 3
            }
        ]
    }
    
    print(f"📊 Batch Processing Summary:")
    print(f"  Documents Processed: {batch_result['documents_processed']}")
    print(f"  Successful: {batch_result['successful']}")
    print(f"  Errors: {batch_result['errors']}")
    print(f"  Processing Time: {batch_result['processing_time']}")
    print()
    
    print("📄 Sample Results:")
    for result in batch_result['results']:
        print(f"  ✅ {result['path']}")
        print(f"     Quality: {result['quality_score']:.2f}")
        print(f"     Category: {result['category']}")
        print(f"     Improvements: {result['improvements']}")
        print()


async def demonstrate_configuration():
    """Demonstrate configuration options."""
    
    print("\n⚙️ Configuration Options Demo")
    print("=" * 40)
    
    config_example = {
        "ai_processing": {
            "enhancement_settings": {
                "preserve_technical_details": True,
                "target_audience": "developers",
                "enhancement_type": "technical",
                "confidence_threshold": 0.7
            },
            "toc_settings": {
                "min_headings": 3,
                "max_depth": 4,
                "auto_insert_toc": False
            },
            "quality_settings": {
                "min_quality_score": 0.7,
                "enable_template_compliance": True,
                "enable_readability_scoring": True
            },
            "batch_processing": {
                "max_concurrent": 5,
                "rate_limit_delay": 1.0,
                "enable_caching": True
            }
        }
    }
    
    print("🔧 Key Configuration Options:")
    print()
    
    print("📝 Content Enhancement:")
    enhancement = config_example["ai_processing"]["enhancement_settings"]
    for key, value in enhancement.items():
        print(f"  {key}: {value}")
    print()
    
    print("📑 Table of Contents:")
    toc = config_example["ai_processing"]["toc_settings"]
    for key, value in toc.items():
        print(f"  {key}: {value}")
    print()
    
    print("📊 Quality Assessment:")
    quality = config_example["ai_processing"]["quality_settings"]
    for key, value in quality.items():
        print(f"  {key}: {value}")
    print()
    
    print("🚀 Batch Processing:")
    batch = config_example["ai_processing"]["batch_processing"]
    for key, value in batch.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    async def main():
        await demonstrate_ai_processing()
        await demonstrate_batch_processing()
        await demonstrate_configuration()
        
        print("\n🎯 Next Steps:")
        print("  1. Configure your Serena MCP server endpoint")
        print("  2. Set up WikiJS connection credentials")
        print("  3. Customize AI processing settings in wikijs_ai_config.json")
        print("  4. Test with your documents using the WikiJS MCP tools")
        print("  5. Set up batch processing workflows for your documentation")
    
    asyncio.run(main())