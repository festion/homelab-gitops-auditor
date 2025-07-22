"""
Setup script for WikiJS MCP Server.
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README
readme_path = Path(__file__).parent / "README.md"
if readme_path.exists():
    with open(readme_path, encoding='utf-8') as f:
        long_description = f.read()
else:
    long_description = "WikiJS MCP Server for document management and integration"

# Read requirements
requirements_path = Path(__file__).parent / "requirements.txt"
if requirements_path.exists():
    with open(requirements_path) as f:
        requirements = [line.strip() for line in f if line.strip() and not line.startswith('#')]
else:
    requirements = [
        "mcp>=0.1.0",
        "aiohttp>=3.8.0", 
        "pydantic>=2.0.0",
        "PyYAML>=6.0"
    ]

setup(
    name="wikijs-mcp-server",
    version="0.1.0",
    description="An MCP server for managing documentation with WikiJS",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="MCP Servers Project",
    author_email="noreply@example.com",
    url="https://github.com/your-org/wikijs-mcp-server",
    package_dir={"": "src"},
    packages=find_packages(where="src"),
    install_requires=requirements,
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-asyncio>=0.21.0",
            "black>=23.0.0",
            "flake8>=6.0.0",
            "mypy>=1.0.0"
        ]
    },
    entry_points={
        "console_scripts": [
            "wikijs-mcp=wikijs_mcp.cli:cli_main",
            "wikijs-mcp-server=wikijs_mcp.server:main"
        ]
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Documentation",
        "Topic :: Text Processing :: Markup"
    ],
    python_requires=">=3.8",
    keywords="mcp wikijs documentation markdown claude ai",
    project_urls={
        "Bug Reports": "https://github.com/your-org/wikijs-mcp-server/issues",
        "Source": "https://github.com/your-org/wikijs-mcp-server",
        "Documentation": "https://github.com/your-org/wikijs-mcp-server/blob/main/README.md"
    }
)