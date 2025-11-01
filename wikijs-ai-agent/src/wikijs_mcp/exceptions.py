"""
Custom exceptions for WikiJS MCP Server.
"""


class WikiJSMCPError(Exception):
    """Base exception for WikiJS MCP Server errors."""
    pass


class WikiJSAPIError(WikiJSMCPError):
    """Exception raised for WikiJS API-related errors."""
    
    def __init__(self, message: str, status_code: int = None, response_data: dict = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_data = response_data or {}


class DocumentError(WikiJSMCPError):
    """Exception raised for document-related errors."""
    pass


class SecurityError(WikiJSMCPError):
    """Exception raised for security validation failures."""
    pass


class ConfigurationError(WikiJSMCPError):
    """Exception raised for configuration-related errors."""
    pass


class AuthenticationError(WikiJSAPIError):
    """Exception raised for authentication failures."""
    pass


class PermissionError(WikiJSMCPError):
    """Exception raised for permission-related errors."""
    pass


class ValidationError(WikiJSMCPError):
    """Exception raised for validation failures."""
    pass