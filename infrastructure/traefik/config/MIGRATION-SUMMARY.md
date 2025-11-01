# Caddy to Traefik Migration Summary

**Generated**: caddy-to-traefik.py
**Source**: config/caddy-backup/Caddyfile.backup
**Output**: infrastructure/traefik/config

## Services Migrated

Total services: **17** (16 auto-detected + 1 manually added)

| Service | Hostname | Backend |
|---------|----------|----------|
| adguard | adguard.internal.lakehouse.wtf | 192.168.1.253:80 |
| birdnet | birdnet.internal.lakehouse.wtf | 192.168.1.80:8080 |
| homeassistant | homeassistant.internal.lakehouse.wtf | 192.168.1.155:8123 |
| influx | influx.internal.lakehouse.wtf | 192.168.1.56:8086 |
| myspeed | myspeed.internal.lakehouse.wtf | 192.168.1.152:5216 |
| omada | omada.internal.lakehouse.wtf | https://192.168.1.47:8043 |
| pairdrop | pairdrop.internal.lakehouse.wtf | 192.168.1.97:3000 |
| proxmox | proxmox.internal.lakehouse.wtf | https://192.168.1.137:8006 |
| proxmox2 | proxmox2.internal.lakehouse.wtf | https://192.168.1.125:8006 |
| pulse | pulse.internal.lakehouse.wtf | 192.168.1.122:7655 |
| watchyourlan | watchyourlan.internal.lakehouse.wtf | 192.168.1.195:8840 |
| wiki | wiki.internal.lakehouse.wtf | 192.168.1.135:3000 |
| esphome | esphome.internal.lakehouse.wtf | 192.168.1.169:6052 |
| z2m | z2m.internal.lakehouse.wtf | 192.168.1.228:8099 |
| **zwave-js-ui** | **zwave-js-ui.internal.lakehouse.wtf** | **https://192.168.1.141:8091** |
| netbox | netbox.internal.lakehouse.wtf | 192.168.1.138 |
| caddy | caddy.internal.lakehouse.wtf | localhost:2019 |

**Note**: The `zwave-js-ui` service was manually added after auto-generation due to a parsing issue with hyphenated service names in the translation script. This service uses HTTPS backend with valid Let's Encrypt certificate (installed during Phase 1).

## Configuration Files Generated

```
infrastructure/traefik/config/
├── traefik.yml              # Static configuration
└── dynamic/
    ├── routers.yml          # HTTP routers
    ├── services.yml         # Backend services
    └── middlewares.yml      # Middleware chains
```

## Next Steps

1. Review generated configurations in `infrastructure/traefik/config`
2. Update Cloudflare API token in environment variables
3. Deploy Traefik container with generated configs
4. Test each service through Traefik
5. Update DNS to point to Traefik
6. Monitor performance and logs
