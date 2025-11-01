#!/usr/bin/env python3
"""
Test script for AI-enhanced WikiJS MCP server integration.

This script tests the basic functionality of the AI processing system
and validates the integration with Serena MCP server.
"""

import asyncio
import json
import logging
import sys
from pathlib import Path

# Import the AI processor
try:
    from src.wikijs_mcp.ai_processor import AIContentProcessor, DEFAULT_AI_CONFIG
    from src.wikijs_mcp.config import WikiJSMCPConfig
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Make sure you're running from the wikijs-mcp-server directory")
    sys.exit(1)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_ai_processor():
    """Test the AI processor functionality."""
    
    print("🧪 Testing AI Processor Integration")
    print("=" * 50)
    
    # Initialize AI processor
    try:
        ai_processor = AIContentProcessor(DEFAULT_AI_CONFIG)
        print("✅ AI Processor initialized successfully")
    except Exception as e:
        print(f"❌ Failed to initialize AI processor: {e}")
        return False
    
    # Test content enhancement
    test_content = """
# Test Document

This is a test document for AI processing.

## Overview
The document contains basic information.

## Details
Here are some details about the test.
"""
    
    try:
        print("\n🤖 Testing content enhancement...")
        enhancement = await ai_processor.enhance_content(
            test_content,
            enhancement_type="general",
            target_audience="general"
        )
        print(f"✅ Content enhancement completed")
        print(f"   Quality Score: {enhancement.quality_score:.2f}")
        print(f"   Readability Score: {enhancement.readability_score:.2f}")
        print(f"   Confidence: {enhancement.confidence:.2f}")
        print(f"   Improvements: {len(enhancement.improvements)}")
        
    except Exception as e:
        print(f"❌ Content enhancement failed: {e}")
        return False
    
    # Test TOC generation
    try:
        print("\n📑 Testing TOC generation...")
        toc = await ai_processor.generate_table_of_contents(test_content)
        if toc:
            print(f"✅ TOC generation completed")
            print(f"   Sections: {len(toc.sections)}")
            print(f"   Depth: {toc.depth}")
            print(f"   Confidence: {toc.confidence:.2f}")
        else:
            print("⚠️ TOC not generated (insufficient headings)")
            
    except Exception as e:
        print(f"❌ TOC generation failed: {e}")
        return False
    
    # Test document categorization
    try:
        print("\n🏷️ Testing document categorization...")
        categorization = await ai_processor.categorize_document(test_content)
        print(f"✅ Document categorization completed")
        print(f"   Primary Category: {categorization.primary_category}")
        print(f"   Tags: {len(categorization.tags)}")
        print(f"   Target Audience: {categorization.target_audience}")
        print(f"   Confidence: {categorization.confidence:.2f}")
        
    except Exception as e:
        print(f"❌ Document categorization failed: {e}")
        return False
    
    # Test quality assessment
    try:
        print("\n📊 Testing quality assessment...")
        assessment = await ai_processor.assess_quality(test_content)
        print(f"✅ Quality assessment completed")
        print(f"   Overall Score: {assessment.overall_score:.2f}")
        print(f"   Grammar Score: {assessment.grammar_score:.2f}")
        print(f"   Structure Score: {assessment.structure_score:.2f}")
        print(f"   Issues Found: {len(assessment.issues)}")
        
    except Exception as e:
        print(f"❌ Quality assessment failed: {e}")
        return False
    
    # Cleanup
    try:
        await ai_processor.cleanup()
        print("\n✅ AI processor cleanup completed")
    except Exception as e:
        print(f"⚠️ Cleanup warning: {e}")
    
    return True


async def test_configuration():
    """Test configuration loading and validation."""
    
    print("\n⚙️ Testing Configuration System")
    print("=" * 40)
    
    # Test default configuration
    try:
        config = DEFAULT_AI_CONFIG
        print("✅ Default configuration loaded")
        print(f"   Serena endpoint: {config.get('serena_endpoint', 'not set')}")
        print(f"   Enhancement settings: {len(config.get('enhancement_settings', {}))}")
        print(f"   TOC settings: {len(config.get('toc_settings', {}))}")
        
    except Exception as e:
        print(f"❌ Configuration loading failed: {e}")
        return False
    
    # Test custom configuration file
    config_file = Path("wikijs_ai_config.json")
    if config_file.exists():
        try:
            with open(config_file, 'r') as f:
                custom_config = json.load(f)
            print("✅ Custom configuration file loaded")
            print(f"   AI processing settings: {len(custom_config.get('ai_processing', {}))}")
            
        except Exception as e:
            print(f"❌ Custom configuration loading failed: {e}")
            return False
    else:
        print("ℹ️ Custom configuration file not found (using defaults)")
    
    return True


async def test_serena_integration():
    """Test Serena MCP server integration."""
    
    print("\n🔗 Testing Serena MCP Integration")
    print("=" * 40)
    
    try:
        from src.wikijs_mcp.ai_processor import SerenaIntegration
        
        serena = SerenaIntegration()
        print("✅ Serena integration initialized")
        
        # Test connection (will use mock for now)
        connected = await serena.connect()
        print(f"✅ Serena connection: {'successful' if connected else 'failed (expected in test mode)'}")
        
        # Test prompts
        prompts = serena.prompts
        print(f"✅ AI prompts loaded: {len(prompts)} prompts available")
        
        await serena.disconnect()
        print("✅ Serena disconnection completed")
        
    except Exception as e:
        print(f"❌ Serena integration test failed: {e}")
        return False
    
    return True


async def run_comprehensive_test():
    """Run comprehensive test suite."""
    
    print("🚀 WikiJS AI-Enhanced MCP Server Test Suite")
    print("=" * 60)
    print()
    
    test_results = []
    
    # Test 1: Configuration
    print("Test 1: Configuration System")
    result1 = await test_configuration()
    test_results.append(("Configuration", result1))
    
    # Test 2: Serena Integration
    print("\nTest 2: Serena MCP Integration")
    result2 = await test_serena_integration()
    test_results.append(("Serena Integration", result2))
    
    # Test 3: AI Processor
    print("\nTest 3: AI Processor")
    result3 = await test_ai_processor()
    test_results.append(("AI Processor", result3))
    
    # Results summary
    print("\n" + "=" * 60)
    print("📊 Test Results Summary")
    print("=" * 60)
    
    passed = 0
    failed = 0
    
    for test_name, result in test_results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print(f"\nTotal: {len(test_results)} tests")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    
    if failed == 0:
        print("\n🎉 All tests passed! AI-enhanced WikiJS MCP server is ready.")
    else:
        print(f"\n⚠️ {failed} test(s) failed. Please check the configuration and dependencies.")
    
    return failed == 0


if __name__ == "__main__":
    async def main():
        try:
            success = await run_comprehensive_test()
            sys.exit(0 if success else 1)
        except KeyboardInterrupt:
            print("\n\n⚠️ Test interrupted by user")
            sys.exit(1)
        except Exception as e:
            print(f"\n\n❌ Unexpected error during testing: {e}")
            sys.exit(1)
    
    asyncio.run(main())