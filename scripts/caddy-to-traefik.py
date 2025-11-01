#!/usr/bin/env python3
"""
Caddy to Traefik Configuration Translator

This script converts Caddy reverse proxy configuration to Traefik v3 format.
It generates both static and dynamic YAML configurations for Traefik.

Usage:
    ./caddy-to-traefik.py --caddyfile /etc/caddy/Caddyfile --output-dir ./infrastructure/traefik/config

Author: Traefik Migration Team
Date: 2025-10-23
"""

import argparse
import re
import yaml
import json
from pathlib import Path
from typing import Dict, List, Tuple, Optional

class CaddyToTraefikTranslator:
    """Translates Caddy configuration to Traefik v3 YAML format."""

    def __init__(self, caddyfile_path: str):
        self.caddyfile_path = Path(caddyfile_path)
        self.services = []
        self.global_options = {}

    def parse_caddyfile(self) -> Dict:
        """Parse Caddyfile and extract service configurations."""
        with open(self.caddyfile_path, 'r') as f:
            content = f.read()

        # Extract global options
        global_match = re.search(r'\{([^}]+)\}', content, re.MULTILINE)
        if global_match:
            global_block = global_match.group(1)
            email_match = re.search(r'email\s+(\S+)', global_block)
            if email_match:
                self.global_options['email'] = email_match.group(1)

            acme_match = re.search(r'acme_dns\s+cloudflare\s+\{([^}]+)\}', global_block)
            if acme_match:
                self.global_options['acme_dns'] = 'cloudflare'

        # Extract wildcard domain block
        wildcard_match = re.search(
            r'\*\.(\S+)\s+\{(.+?)\n\}',
            content,
            re.DOTALL | re.MULTILINE
        )

        if wildcard_match:
            domain = wildcard_match.group(1)
            block = wildcard_match.group(2)

            # Extract all service definitions
            service_pattern = r'@(\w+)\s+host\s+(\S+)\s+handle\s+@\1\s+\{(.+?)\n\s+\}'
            for match in re.finditer(service_pattern, block, re.DOTALL):
                service_name = match.group(1)
                hostname = match.group(2)
                handler_block = match.group(3)

                # Parse reverse_proxy directive
                proxy_match = re.search(
                    r'reverse_proxy\s+(\S+)(?:\s+\{(.+?)\})?',
                    handler_block,
                    re.DOTALL
                )

                if proxy_match:
                    backend = proxy_match.group(1)
                    options_block = proxy_match.group(2) or ''

                    service = {
                        'name': service_name,
                        'hostname': hostname,
                        'backend': backend,
                        'options': self._parse_proxy_options(options_block)
                    }

                    self.services.append(service)

        return {
            'global_options': self.global_options,
            'services': self.services
        }

    def _parse_proxy_options(self, options_block: str) -> Dict:
        """Parse reverse_proxy options block."""
        options = {
            'headers': {},
            'transport': {}
        }

        # Parse custom headers
        header_pattern = r'header_up\s+([-\w]+)\s+(.+)'
        for match in re.finditer(header_pattern, options_block):
            header_name = match.group(1)
            header_value = match.group(2).strip()
            options['headers'][header_name] = header_value

        # Parse transport options
        if 'tls_insecure_skip_verify' in options_block:
            options['transport']['insecure_skip_verify'] = True

        return options

    def generate_traefik_static_config(self) -> Dict:
        """Generate Traefik static configuration (traefik.yml)."""

        config = {
            'global': {
                'checkNewVersion': True,
                'sendAnonymousUsage': False
            },
            'api': {
                'dashboard': True,
                'insecure': False
            },
            'entryPoints': {
                'web': {
                    'address': ':80',
                    'http': {
                        'redirections': {
                            'entryPoint': {
                                'to': 'websecure',
                                'scheme': 'https',
                                'permanent': True
                            }
                        }
                    }
                },
                'websecure': {
                    'address': ':443',
                    'http': {
                        'tls': {
                            'certResolver': 'cloudflare'
                        }
                    }
                }
            },
            'providers': {
                'file': {
                    'directory': '/etc/traefik/dynamic',
                    'watch': True
                }
            },
            'certificatesResolvers': {
                'cloudflare': {
                    'acme': {
                        'email': self.global_options.get('email', 'admin@example.com'),
                        'storage': '/etc/traefik/acme.json',
                        'dnsChallenge': {
                            'provider': 'cloudflare',
                            'resolvers': [
                                '1.1.1.1:53',
                                '8.8.8.8:53'
                            ]
                        }
                    }
                }
            },
            'log': {
                'level': 'INFO',
                'filePath': '/var/log/traefik/traefik.log'
            },
            'accessLog': {
                'filePath': '/var/log/traefik/access.log',
                'format': 'json',
                'bufferingSize': 100
            },
            'metrics': {
                'prometheus': {
                    'addEntryPointsLabels': True,
                    'addRoutersLabels': True,
                    'addServicesLabels': True
                }
            }
        }

        return config

    def generate_traefik_dynamic_config(self) -> Dict:
        """Generate Traefik dynamic configuration (routers and services)."""

        http_routers = {}
        http_services = {}
        http_middlewares = self._generate_middlewares()

        for service in self.services:
            router_name = f"{service['name']}-router"
            service_name = f"{service['name']}-service"

            # Determine middleware chain
            middlewares = ['secure-headers']

            # Add custom middleware for specific services
            if service['name'] == 'esphome':
                middlewares.append('esphome-headers')
            elif service['name'] == 'netbox':
                middlewares.append('netbox-headers')

            # Add admin whitelist for administrative interfaces
            admin_services = ['proxmox', 'proxmox2', 'omada', 'caddy', 'pulse', 'influx']
            if service['name'] in admin_services:
                middlewares.insert(0, 'internal-whitelist')

            # Create router
            http_routers[router_name] = {
                'rule': f"Host(`{service['hostname']}`)",
                'service': service_name,
                'entryPoints': ['websecure'],
                'middlewares': middlewares,
                'tls': {
                    'certResolver': 'cloudflare',
                    'domains': [{
                        'main': '*.internal.lakehouse.wtf'
                    }]
                }
            }

            # Create service backend
            backend_url = self._parse_backend_url(service['backend'])

            http_services[service_name] = {
                'loadBalancer': {
                    'servers': [{
                        'url': backend_url
                    }],
                    'healthCheck': {
                        'path': '/',
                        'interval': '30s',
                        'timeout': '5s'
                    }
                }
            }

            # Add TLS options for HTTPS backends (no longer needed with Let's Encrypt)
            # This section intentionally removed as all backends now use valid certs

        return {
            'http': {
                'routers': http_routers,
                'services': http_services,
                'middlewares': http_middlewares
            }
        }

    def _generate_middlewares(self) -> Dict:
        """Generate middleware configurations."""

        middlewares = {
            'secure-headers': {
                'headers': {
                    'sslRedirect': True,
                    'stsSeconds': 31536000,
                    'stsIncludeSubdomains': True,
                    'stsPreload': True,
                    'contentTypeNosniff': True,
                    'browserXssFilter': True,
                    'frameDeny': True,
                    'referrerPolicy': 'strict-origin-when-cross-origin',
                    'permissionsPolicy': 'geolocation=(), microphone=(), camera=()',
                    'customFrameOptionsValue': 'SAMEORIGIN'
                }
            },
            'internal-whitelist': {
                'ipWhiteList': {
                    'sourceRange': [
                        '192.168.1.0/24'
                    ]
                }
            },
            'esphome-headers': {
                'headers': {
                    'customRequestHeaders': {
                        'X-Real-IP': '',
                        'X-Forwarded-For': '',
                        'X-Forwarded-Proto': ''
                    }
                }
            },
            'netbox-headers': {
                'headers': {
                    'customRequestHeaders': {
                        'X-Forwarded-Host': ''
                    }
                }
            }
        }

        return middlewares

    def _parse_backend_url(self, backend: str) -> str:
        """Convert Caddy backend format to Traefik URL."""

        # Handle HTTPS backends
        if backend.startswith('https://'):
            return backend

        # Handle HTTP backends with explicit protocol
        if backend.startswith('http://'):
            return backend

        # Handle localhost
        if backend.startswith('localhost:'):
            return f"http://{backend}"

        # Default to HTTP for IP:port format
        if ':' in backend:
            return f"http://{backend}"

        # Default fallback
        return f"http://{backend}"

    def write_configurations(self, output_dir: Path):
        """Write all Traefik configuration files."""

        output_dir.mkdir(parents=True, exist_ok=True)

        # Write static configuration
        static_config = self.generate_traefik_static_config()
        static_path = output_dir / 'traefik.yml'
        with open(static_path, 'w') as f:
            yaml.dump(static_config, f, default_flow_style=False, sort_keys=False)

        print(f"✅ Created static configuration: {static_path}")

        # Write dynamic configuration
        dynamic_dir = output_dir / 'dynamic'
        dynamic_dir.mkdir(exist_ok=True)

        dynamic_config = self.generate_traefik_dynamic_config()

        # Split into separate files for clarity
        routers_path = dynamic_dir / 'routers.yml'
        with open(routers_path, 'w') as f:
            yaml.dump({'http': {'routers': dynamic_config['http']['routers']}},
                     f, default_flow_style=False, sort_keys=False)
        print(f"✅ Created routers configuration: {routers_path}")

        services_path = dynamic_dir / 'services.yml'
        with open(services_path, 'w') as f:
            yaml.dump({'http': {'services': dynamic_config['http']['services']}},
                     f, default_flow_style=False, sort_keys=False)
        print(f"✅ Created services configuration: {services_path}")

        middlewares_path = dynamic_dir / 'middlewares.yml'
        with open(middlewares_path, 'w') as f:
            yaml.dump({'http': {'middlewares': dynamic_config['http']['middlewares']}},
                     f, default_flow_style=False, sort_keys=False)
        print(f"✅ Created middlewares configuration: {middlewares_path}")

        # Generate summary report
        self._write_summary_report(output_dir)

    def _write_summary_report(self, output_dir: Path):
        """Generate migration summary report."""

        report_path = output_dir / 'MIGRATION-SUMMARY.md'

        with open(report_path, 'w') as f:
            f.write("# Caddy to Traefik Migration Summary\n\n")
            f.write(f"**Generated**: {Path(__file__).name}\n")
            f.write(f"**Source**: {self.caddyfile_path}\n")
            f.write(f"**Output**: {output_dir}\n\n")

            f.write("## Services Migrated\n\n")
            f.write(f"Total services: **{len(self.services)}**\n\n")

            f.write("| Service | Hostname | Backend |\n")
            f.write("|---------|----------|----------|\n")
            for service in self.services:
                f.write(f"| {service['name']} | {service['hostname']} | {service['backend']} |\n")

            f.write("\n## Configuration Files Generated\n\n")
            f.write("```\n")
            f.write(f"{output_dir}/\n")
            f.write("├── traefik.yml              # Static configuration\n")
            f.write("└── dynamic/\n")
            f.write("    ├── routers.yml          # HTTP routers\n")
            f.write("    ├── services.yml         # Backend services\n")
            f.write("    └── middlewares.yml      # Middleware chains\n")
            f.write("```\n\n")

            f.write("## Next Steps\n\n")
            f.write("1. Review generated configurations in `{}`\n".format(output_dir))
            f.write("2. Update Cloudflare API token in environment variables\n")
            f.write("3. Deploy Traefik container with generated configs\n")
            f.write("4. Test each service through Traefik\n")
            f.write("5. Update DNS to point to Traefik\n")
            f.write("6. Monitor performance and logs\n")

        print(f"✅ Created migration summary: {report_path}")

def main():
    parser = argparse.ArgumentParser(
        description='Convert Caddy configuration to Traefik v3 YAML format'
    )
    parser.add_argument(
        '--caddyfile',
        type=str,
        required=True,
        help='Path to Caddyfile'
    )
    parser.add_argument(
        '--output-dir',
        type=str,
        default='./infrastructure/traefik/config',
        help='Output directory for Traefik configurations'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Parse configuration without writing files'
    )

    args = parser.parse_args()

    print("=" * 60)
    print("Caddy to Traefik Configuration Translator")
    print("=" * 60)
    print()

    # Initialize translator
    translator = CaddyToTraefikTranslator(args.caddyfile)

    # Parse Caddyfile
    print(f"📖 Parsing Caddyfile: {args.caddyfile}")
    config = translator.parse_caddyfile()
    print(f"✅ Found {len(translator.services)} services")
    print()

    if args.dry_run:
        print("🔍 Dry run mode - configuration parsed successfully")
        print()
        print("Services found:")
        for service in translator.services:
            print(f"  - {service['name']}: {service['hostname']} → {service['backend']}")
        return

    # Write configurations
    output_dir = Path(args.output_dir)
    print(f"📝 Writing Traefik configurations to: {output_dir}")
    print()

    translator.write_configurations(output_dir)

    print()
    print("=" * 60)
    print("✨ Migration complete!")
    print("=" * 60)

if __name__ == '__main__':
    main()
