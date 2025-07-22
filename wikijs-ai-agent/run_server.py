#!/usr/bin/env python3
"""
WikiJS MCP Server runner script.
"""

import sys
import os
from pathlib import Path

# Add src directory to Python path
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
sys.path.insert(0, str(src_dir))

if __name__ == "__main__":
    from wikijs_mcp.server import main
    import asyncio
    asyncio.run(main())