"""
AI-Enhanced Document Processing Module for WikiJS MCP Server

This module integrates with Serena MCP server to provide intelligent document 
processing capabilities including content enhancement, TOC generation, 
cross-document linking, and quality assurance.
"""

import asyncio
import json
import logging
import re
import hashlib
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from pathlib import Path

# MCP client for Serena integration
import mcp

logger = logging.getLogger(__name__)


@dataclass
class ContentEnhancement:
    """Results from AI content enhancement."""
    original_content: str
    enhanced_content: str
    improvements: List[str]
    quality_score: float
    readability_score: float
    confidence: float
    timestamp: datetime
    enhancement_type: str


@dataclass
class TableOfContents:
    """Generated table of contents."""
    sections: List[Dict[str, Any]]
    depth: int
    anchor_links: Dict[str, str]
    placement_suggestion: str
    confidence: float


@dataclass
class DocumentCategorizationResult:
    """Document categorization and tagging results."""
    primary_category: str
    secondary_categories: List[str]
    tags: List[str]
    target_audience: str
    complexity_level: str
    confidence: float
    related_documents: List[str]


@dataclass
class CrossDocumentLinks:
    """Cross-document linking results."""
    internal_links: List[Dict[str, Any]]
    external_references: List[Dict[str, Any]]
    broken_links: List[str]
    suggested_links: List[Dict[str, Any]]
    confidence: float


@dataclass
class QualityAssessment:
    """Document quality assessment."""
    grammar_score: float
    readability_score: float
    technical_accuracy_score: float
    structure_score: float
    overall_score: float
    issues: List[Dict[str, Any]]
    suggestions: List[str]
    compliance_score: float


class SerenaIntegration:
    """Integration with Serena MCP server for AI processing."""
    
    def __init__(self, serena_endpoint: str = "mcp://serena-enhanced"):
        self.serena_endpoint = serena_endpoint
        self.client = None
        self.prompts = self._initialize_prompts()
    
    def _initialize_prompts(self) -> Dict[str, str]:
        """Initialize AI prompts for different processing tasks."""
        return {
            'enhance_content': """
Improve this technical document for clarity, completeness, and readability:

DOCUMENT:
{content}

REQUIREMENTS:
- Fix grammar and style issues
- Add missing context and explanations where needed
- Improve technical accuracy and precision
- Enhance structure and organization
- Maintain all technical details and code examples
- Preserve original meaning and intent
- Focus on clarity for the target audience

RESPONSE FORMAT:
{{
    "enhanced_content": "improved document content",
    "improvements": ["list of specific improvements made"],
    "quality_score": 0.0-1.0,
    "readability_score": 0.0-1.0,
    "confidence": 0.0-1.0
}}
""",
            
            'generate_toc': """
Generate a comprehensive table of contents for this document:

DOCUMENT:
{content}

REQUIREMENTS:
- Use proper heading hierarchy (H1, H2, H3, etc.)
- Create descriptive section titles
- Include subsection organization
- Generate anchor links for navigation
- Suggest optimal TOC placement
- Consider document length and complexity

RESPONSE FORMAT:
{{
    "sections": [
        {{"level": 1, "title": "Section Title", "anchor": "#section-anchor", "line_number": 10}},
        {{"level": 2, "title": "Subsection", "anchor": "#subsection-anchor", "line_number": 25}}
    ],
    "depth": 3,
    "placement_suggestion": "after_introduction",
    "confidence": 0.0-1.0
}}
""",
            
            'categorize_document': """
Analyze this document and provide categorization and tagging:

DOCUMENT:
{content}

CATEGORIES:
- technical: API, Configuration, Architecture, Development
- operational: Deployment, Monitoring, Troubleshooting, Maintenance  
- user: Tutorial, Guide, FAQ, Reference
- project: Planning, Requirements, Design, Testing

REQUIREMENTS:
- Assign primary and secondary categories
- Generate 5-10 relevant tags
- Identify target audience
- Assess complexity level (beginner/intermediate/advanced)
- Suggest related document topics

RESPONSE FORMAT:
{{
    "primary_category": "category_name",
    "secondary_categories": ["category1", "category2"],
    "tags": ["tag1", "tag2", "tag3"],
    "target_audience": "developers/users/administrators",
    "complexity_level": "beginner/intermediate/advanced",
    "confidence": 0.0-1.0,
    "related_documents": ["topic1", "topic2"]
}}
""",
            
            'detect_links': """
Analyze this document for cross-document linking opportunities:

DOCUMENT:
{content}

AVAILABLE_DOCUMENTS:
{document_list}

REQUIREMENTS:
- Identify concepts that could link to other documents
- Detect broken or missing links
- Suggest meaningful link text and descriptions
- Find external references that need documentation
- Recommend internal navigation improvements

RESPONSE FORMAT:
{{
    "suggested_links": [
        {{"text": "concept", "target_doc": "document_path", "context": "surrounding text", "confidence": 0.0-1.0}}
    ],
    "broken_links": ["link1", "link2"],
    "external_references": [
        {{"text": "reference", "url": "external_url", "needs_documentation": true}}
    ],
    "confidence": 0.0-1.0
}}
""",
            
            'assess_quality': """
Perform comprehensive quality assessment of this document:

DOCUMENT:
{content}

ASSESSMENT_CRITERIA:
- Grammar and writing style
- Technical accuracy and precision
- Document structure and organization
- Readability and clarity
- Completeness and usefulness
- Consistency with style guides

REQUIREMENTS:
- Provide scores (0.0-1.0) for each criterion
- Identify specific issues and their locations
- Suggest concrete improvements
- Assess template compliance if applicable

RESPONSE FORMAT:
{{
    "grammar_score": 0.0-1.0,
    "readability_score": 0.0-1.0, 
    "technical_accuracy_score": 0.0-1.0,
    "structure_score": 0.0-1.0,
    "overall_score": 0.0-1.0,
    "issues": [
        {{"type": "grammar", "line": 10, "description": "issue description", "suggestion": "fix suggestion"}}
    ],
    "suggestions": ["improvement1", "improvement2"],
    "compliance_score": 0.0-1.0
}}
""",

            'improve_readability': """
Improve the readability of this document while maintaining technical accuracy:

DOCUMENT:
{content}

TARGET_AUDIENCE: {audience}
COMPLEXITY_LEVEL: {complexity}

REQUIREMENTS:
- Improve sentence structure and flow
- Simplify complex explanations where appropriate
- Add context and examples for difficult concepts
- Optimize paragraph structure
- Enhance transitions between sections
- Maintain all technical information and accuracy

RESPONSE FORMAT:
{{
    "improved_content": "readability-enhanced content",
    "readability_improvements": ["specific readability improvements"],
    "readability_score_before": 0.0-1.0,
    "readability_score_after": 0.0-1.0,
    "confidence": 0.0-1.0
}}
"""
        }
    
    async def connect(self):
        """Connect to Serena MCP server."""
        try:
            # This would be the actual MCP client connection
            # For now, we'll simulate the connection
            logger.info("Connecting to Serena MCP server")
            self.client = "connected"  # Placeholder
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Serena MCP server: {e}")
            return False
    
    async def disconnect(self):
        """Disconnect from Serena MCP server."""
        if self.client:
            self.client = None
            logger.info("Disconnected from Serena MCP server")
    
    async def _call_serena(self, prompt: str, tool_name: str = "analyze") -> Dict[str, Any]:
        """Call Serena MCP server with a prompt."""
        try:
            # This would be the actual MCP call to Serena
            # For now, we'll return a simulated response
            logger.info(f"Calling Serena MCP server with tool: {tool_name}")
            
            # Simulate AI processing delay
            await asyncio.sleep(0.1)
            
            # Return a mock response based on the tool
            if "enhance_content" in prompt:
                return {
                    "enhanced_content": "Enhanced content would be here",
                    "improvements": ["Improved clarity", "Fixed grammar", "Enhanced structure"],
                    "quality_score": 0.85,
                    "readability_score": 0.78,
                    "confidence": 0.9
                }
            elif "generate_toc" in prompt:
                return {
                    "sections": [
                        {"level": 1, "title": "Introduction", "anchor": "#introduction", "line_number": 1},
                        {"level": 2, "title": "Overview", "anchor": "#overview", "line_number": 15},
                        {"level": 1, "title": "Implementation", "anchor": "#implementation", "line_number": 30}
                    ],
                    "depth": 2,
                    "placement_suggestion": "after_introduction",
                    "confidence": 0.9
                }
            elif "categorize_document" in prompt:
                return {
                    "primary_category": "technical",
                    "secondary_categories": ["development", "configuration"],
                    "tags": ["api", "documentation", "development", "configuration", "setup"],
                    "target_audience": "developers",
                    "complexity_level": "intermediate",
                    "confidence": 0.85,
                    "related_documents": ["api-setup", "configuration-guide"]
                }
            elif "detect_links" in prompt:
                return {
                    "suggested_links": [
                        {"text": "API configuration", "target_doc": "/api/config", "context": "setup process", "confidence": 0.8}
                    ],
                    "broken_links": [],
                    "external_references": [],
                    "confidence": 0.75
                }
            elif "assess_quality" in prompt:
                return {
                    "grammar_score": 0.9,
                    "readability_score": 0.8,
                    "technical_accuracy_score": 0.95,
                    "structure_score": 0.85,
                    "overall_score": 0.875,
                    "issues": [],
                    "suggestions": ["Add more examples", "Improve section transitions"],
                    "compliance_score": 0.9
                }
            else:
                return {"error": "Unknown prompt type"}
                
        except Exception as e:
            logger.error(f"Serena MCP call failed: {e}")
            raise


class AIContentProcessor:
    """Main AI content processing engine."""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.serena = SerenaIntegration(config.get('serena_endpoint', 'mcp://serena-enhanced'))
        self.processing_cache = {}
        self.template_configs = self._load_template_configs()
    
    def _load_template_configs(self) -> Dict[str, Any]:
        """Load template configurations for compliance checking."""
        return {
            'api_documentation': {
                'required_sections': ['Overview', 'Parameters', 'Examples', 'Response'],
                'optional_sections': ['Authentication', 'Rate Limits', 'SDKs'],
                'validation_rules': ['code_examples_present', 'parameter_types_defined']
            },
            'user_guide': {
                'required_sections': ['Introduction', 'Prerequisites', 'Steps', 'Troubleshooting'],
                'optional_sections': ['Advanced Usage', 'FAQ'],
                'validation_rules': ['step_numbering', 'screenshot_references']
            },
            'technical_reference': {
                'required_sections': ['Overview', 'Specifications', 'Implementation'],
                'optional_sections': ['Examples', 'Best Practices'],
                'validation_rules': ['technical_accuracy', 'complete_specifications']
            }
        }
    
    async def initialize(self) -> bool:
        """Initialize the AI processor."""
        return await self.serena.connect()
    
    async def cleanup(self):
        """Clean up resources."""
        await self.serena.disconnect()
    
    async def enhance_content(
        self, 
        content: str, 
        enhancement_type: str = "general",
        target_audience: str = "general",
        preserve_technical_details: bool = True
    ) -> ContentEnhancement:
        """Enhance document content using AI."""
        try:
            # Check cache first
            content_hash = hashlib.md5(content.encode()).hexdigest()
            cache_key = f"enhance_{content_hash}_{enhancement_type}"
            
            if cache_key in self.processing_cache:
                logger.info("Returning cached content enhancement")
                return self.processing_cache[cache_key]
            
            # Prepare prompt
            prompt = self.serena.prompts['enhance_content'].format(
                content=content,
                enhancement_type=enhancement_type,
                target_audience=target_audience,
                preserve_technical_details=preserve_technical_details
            )
            
            # Call Serena
            result = await self.serena._call_serena(prompt, "enhance_content")
            
            # Create enhancement object
            enhancement = ContentEnhancement(
                original_content=content,
                enhanced_content=result.get('enhanced_content', content),
                improvements=result.get('improvements', []),
                quality_score=result.get('quality_score', 0.5),
                readability_score=result.get('readability_score', 0.5),
                confidence=result.get('confidence', 0.5),
                timestamp=datetime.now(),
                enhancement_type=enhancement_type
            )
            
            # Cache result
            self.processing_cache[cache_key] = enhancement
            
            logger.info(f"Content enhanced with {len(enhancement.improvements)} improvements")
            return enhancement
            
        except Exception as e:
            logger.error(f"Content enhancement failed: {e}")
            raise
    
    async def generate_table_of_contents(self, content: str, min_headings: int = 3) -> Optional[TableOfContents]:
        """Generate table of contents for document."""
        try:
            # Check if document has enough headings to warrant TOC
            heading_count = len(re.findall(r'^#{1,6}\s+.+', content, re.MULTILINE))
            if heading_count < min_headings:
                logger.info(f"Document has only {heading_count} headings, skipping TOC generation")
                return None
            
            # Prepare prompt
            prompt = self.serena.prompts['generate_toc'].format(content=content)
            
            # Call Serena
            result = await self.serena._call_serena(prompt, "generate_toc")
            
            # Create TOC object
            toc = TableOfContents(
                sections=result.get('sections', []),
                depth=result.get('depth', 2),
                anchor_links={},
                placement_suggestion=result.get('placement_suggestion', 'beginning'),
                confidence=result.get('confidence', 0.5)
            )
            
            # Generate anchor links
            for section in toc.sections:
                anchor = section.get('anchor', self._generate_anchor(section.get('title', '')))
                toc.anchor_links[section.get('title', '')] = anchor
            
            logger.info(f"Generated TOC with {len(toc.sections)} sections")
            return toc
            
        except Exception as e:
            logger.error(f"TOC generation failed: {e}")
            return None
    
    def _generate_anchor(self, title: str) -> str:
        """Generate anchor link from section title."""
        anchor = re.sub(r'[^\w\s-]', '', title.lower())
        anchor = re.sub(r'[-\s]+', '-', anchor)
        return f"#{anchor.strip('-')}"
    
    async def categorize_document(self, content: str, file_path: str = "") -> DocumentCategorizationResult:
        """Categorize and tag document using AI."""
        try:
            # Prepare prompt
            prompt = self.serena.prompts['categorize_document'].format(
                content=content,
                file_path=file_path
            )
            
            # Call Serena
            result = await self.serena._call_serena(prompt, "categorize_document")
            
            # Create categorization result
            categorization = DocumentCategorizationResult(
                primary_category=result.get('primary_category', 'general'),
                secondary_categories=result.get('secondary_categories', []),
                tags=result.get('tags', []),
                target_audience=result.get('target_audience', 'general'),
                complexity_level=result.get('complexity_level', 'intermediate'),
                confidence=result.get('confidence', 0.5),
                related_documents=result.get('related_documents', [])
            )
            
            logger.info(f"Document categorized as {categorization.primary_category} with {len(categorization.tags)} tags")
            return categorization
            
        except Exception as e:
            logger.error(f"Document categorization failed: {e}")
            # Return default categorization
            return DocumentCategorizationResult(
                primary_category="general",
                secondary_categories=[],
                tags=[],
                target_audience="general",
                complexity_level="intermediate",
                confidence=0.0,
                related_documents=[]
            )
    
    async def detect_cross_document_links(
        self, 
        content: str, 
        available_documents: List[str],
        existing_links: List[str] = None
    ) -> CrossDocumentLinks:
        """Detect and suggest cross-document links."""
        try:
            existing_links = existing_links or []
            
            # Prepare prompt with available documents
            document_list = "\n".join(f"- {doc}" for doc in available_documents[:50])  # Limit for prompt size
            
            prompt = self.serena.prompts['detect_links'].format(
                content=content,
                document_list=document_list
            )
            
            # Call Serena
            result = await self.serena._call_serena(prompt, "detect_links")
            
            # Create cross-document links object
            links = CrossDocumentLinks(
                internal_links=result.get('suggested_links', []),
                external_references=result.get('external_references', []),
                broken_links=self._detect_broken_links(content, existing_links),
                suggested_links=result.get('suggested_links', []),
                confidence=result.get('confidence', 0.5)
            )
            
            logger.info(f"Detected {len(links.suggested_links)} potential cross-document links")
            return links
            
        except Exception as e:
            logger.error(f"Cross-document link detection failed: {e}")
            return CrossDocumentLinks(
                internal_links=[],
                external_references=[],
                broken_links=[],
                suggested_links=[],
                confidence=0.0
            )
    
    def _detect_broken_links(self, content: str, existing_links: List[str]) -> List[str]:
        """Detect broken internal links in content."""
        broken_links = []
        
        # Find all markdown links
        link_pattern = r'\[([^\]]+)\]\(([^)]+)\)'
        matches = re.findall(link_pattern, content)
        
        for link_text, link_url in matches:
            if link_url.startswith('/') or link_url.startswith('./'):
                # Internal link - check if it exists in available documents
                if link_url not in existing_links:
                    broken_links.append(link_url)
        
        return broken_links
    
    async def assess_quality(self, content: str, template_type: str = None) -> QualityAssessment:
        """Assess document quality using AI."""
        try:
            # Prepare prompt
            prompt = self.serena.prompts['assess_quality'].format(
                content=content,
                template_type=template_type or "general"
            )
            
            # Call Serena
            result = await self.serena._call_serena(prompt, "assess_quality")
            
            # Create quality assessment
            assessment = QualityAssessment(
                grammar_score=result.get('grammar_score', 0.5),
                readability_score=result.get('readability_score', 0.5),
                technical_accuracy_score=result.get('technical_accuracy_score', 0.5),
                structure_score=result.get('structure_score', 0.5),
                overall_score=result.get('overall_score', 0.5),
                issues=result.get('issues', []),
                suggestions=result.get('suggestions', []),
                compliance_score=result.get('compliance_score', 0.5)
            )
            
            # Add template compliance check if specified
            if template_type and template_type in self.template_configs:
                compliance = self._check_template_compliance(content, template_type)
                assessment.compliance_score = compliance
            
            logger.info(f"Quality assessment completed with overall score: {assessment.overall_score:.2f}")
            return assessment
            
        except Exception as e:
            logger.error(f"Quality assessment failed: {e}")
            # Return default assessment
            return QualityAssessment(
                grammar_score=0.5, readability_score=0.5, technical_accuracy_score=0.5,
                structure_score=0.5, overall_score=0.5, issues=[], suggestions=[], compliance_score=0.5
            )
    
    def _check_template_compliance(self, content: str, template_type: str) -> float:
        """Check compliance with template requirements."""
        if template_type not in self.template_configs:
            return 0.5
        
        template_config = self.template_configs[template_type]
        required_sections = template_config.get('required_sections', [])
        
        # Check for required sections
        found_sections = 0
        for section in required_sections:
            if re.search(rf'#+\s*{re.escape(section)}', content, re.IGNORECASE):
                found_sections += 1
        
        compliance_score = found_sections / len(required_sections) if required_sections else 1.0
        return min(compliance_score, 1.0)
    
    async def improve_readability(
        self, 
        content: str, 
        target_audience: str = "general",
        complexity_level: str = "intermediate"
    ) -> Dict[str, Any]:
        """Improve document readability while preserving technical accuracy."""
        try:
            # Prepare prompt
            prompt = self.serena.prompts['improve_readability'].format(
                content=content,
                audience=target_audience,
                complexity=complexity_level
            )
            
            # Call Serena
            result = await self.serena._call_serena(prompt, "improve_readability")
            
            logger.info("Readability improvement completed")
            return result
            
        except Exception as e:
            logger.error(f"Readability improvement failed: {e}")
            return {
                "improved_content": content,
                "readability_improvements": [],
                "readability_score_before": 0.5,
                "readability_score_after": 0.5,
                "confidence": 0.0
            }
    
    async def process_document_batch(
        self, 
        documents: List[Dict[str, Any]], 
        processing_options: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Process multiple documents in batch with AI enhancements."""
        results = []
        
        for i, doc in enumerate(documents):
            try:
                logger.info(f"Processing document {i+1}/{len(documents)}: {doc.get('path', 'unknown')}")
                
                content = doc.get('content', '')
                if not content:
                    continue
                
                # Process document based on options
                doc_result = {
                    'original_path': doc.get('path', ''),
                    'processed_at': datetime.now(),
                    'processing_options': processing_options
                }
                
                # Content enhancement
                if processing_options.get('enhance_content', True):
                    enhancement = await self.enhance_content(
                        content,
                        enhancement_type=processing_options.get('enhancement_type', 'general'),
                        target_audience=processing_options.get('target_audience', 'general')
                    )
                    doc_result['enhancement'] = asdict(enhancement)
                
                # TOC generation
                if processing_options.get('generate_toc', True):
                    toc = await self.generate_table_of_contents(content)
                    if toc:
                        doc_result['toc'] = asdict(toc)
                
                # Categorization
                if processing_options.get('categorize', True):
                    categorization = await self.categorize_document(content, doc.get('path', ''))
                    doc_result['categorization'] = asdict(categorization)
                
                # Quality assessment
                if processing_options.get('assess_quality', True):
                    quality = await self.assess_quality(content, processing_options.get('template_type'))
                    doc_result['quality'] = asdict(quality)
                
                results.append(doc_result)
                
                # Rate limiting
                if processing_options.get('rate_limit_delay', 0) > 0:
                    await asyncio.sleep(processing_options['rate_limit_delay'])
                
            except Exception as e:
                logger.error(f"Failed to process document {doc.get('path', 'unknown')}: {e}")
                results.append({
                    'original_path': doc.get('path', ''),
                    'error': str(e),
                    'processed_at': datetime.now()
                })
        
        logger.info(f"Batch processing completed: {len(results)} documents processed")
        return results


# Processing pipeline configuration
AI_PROCESSING_PIPELINE = [
    'content_analysis',           # Analyze document structure and content
    'grammar_enhancement',        # Fix grammar and style issues
    'structure_optimization',     # Improve document organization
    'link_detection',            # Find and create internal links
    'toc_generation',            # Generate table of contents
    'categorization',            # Classify and tag document
    'quality_scoring',           # Assess content quality
    'template_compliance',       # Check template adherence
    'final_validation'           # Final quality check
]


# Default configuration for AI processing
DEFAULT_AI_CONFIG = {
    'serena_endpoint': 'mcp://serena-enhanced',
    'processing_pipeline': AI_PROCESSING_PIPELINE,
    'enhancement_settings': {
        'preserve_technical_details': True,
        'target_audience': 'developers',
        'enhancement_type': 'technical',
        'confidence_threshold': 0.7
    },
    'toc_settings': {
        'min_headings': 3,
        'max_depth': 4,
        'include_numbering': True
    },
    'categorization_settings': {
        'max_tags': 10,
        'confidence_threshold': 0.6
    },
    'quality_settings': {
        'min_quality_score': 0.7,
        'enable_template_compliance': True
    },
    'batch_processing': {
        'max_concurrent': 5,
        'rate_limit_delay': 1.0,
        'enable_caching': True
    }
}