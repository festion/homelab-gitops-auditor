#!/usr/bin/env node

/**
 * Add Homepage secrets to Infisical homelab-gitops project
 *
 * Usage:
 *   INFISICAL_TOKEN=st.650cfc13... node add-homepage-secrets.js
 */

const axios = require('axios');

const INFISICAL_URL = process.env.INFISICAL_SITE_URL || 'https://infisical.internal.lakehouse.wtf';
const INFISICAL_TOKEN = process.env.INFISICAL_TOKEN;
const ENVIRONMENT = process.env.INFISICAL_ENVIRONMENT || 'prod';

// Disable TLS verification for self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const secrets = {
  // Application Configuration
  'NODE_ENV': 'production',
  'PORT': '3000',
  'HOMEPAGE_ALLOWED_HOSTS': 'homepage.internal.lakehouse.wtf,192.168.1.45,localhost',

  // Proxmox Integration
  'HOMEPAGE_VAR_PROXMOX_USER': 'api@pve!homepage',
  'HOMEPAGE_VAR_PROXMOX_TOKEN': 'b82507b4-bd40-4dca-964d-bed948507af5',

  // Home Assistant Integration
  'HOMEPAGE_VAR_HASS_TOKEN': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI5YTAyYzMxZTNkYjM0YmQxYTQ2YzNlMmJhZDExMjI3NCIsImlhdCI6MTc0NzUwODk4OSwiZXhwIjoyMDYyODY4OTg5fQ.BwOQMlSgBOi7kb2IwgSIK4KCRDe2mI-sJL496NUwHkE',

  // AdGuard Integration
  'HOMEPAGE_VAR_ADGUARD_USER': 'admin',
  'HOMEPAGE_VAR_ADGUARD_PASS': 'your-password',

  // TrueNAS Integration
  'HOMEPAGE_VAR_TRUENAS_KEY': '2-pAgetpXlM3uqD0zg0EVuCZUIsxZisLcQ4kjB8a4zKFsRyKTM8kmwg9hgpeN5BYn5',

  // Grafana Integration
  'HOMEPAGE_VAR_GRAFANA_USER': 'admin',
  'HOMEPAGE_VAR_GRAFANA_PASS': 'redflower805',

  // Omada Integration
  'HOMEPAGE_VAR_OMADA_USER': 'admin',
  'HOMEPAGE_VAR_OMADA_PASS': 'admin',

  // InfluxDB Integration
  'HOMEPAGE_VAR_INFLUX_USER': 'admin',
  'HOMEPAGE_VAR_INFLUX_PASS': 'redflower805'
};

async function addSecret(secretName, secretValue) {
  try {
    // Try to create the secret
    const response = await axios.post(
      `${INFISICAL_URL}/api/v3/secrets/${secretName}`,
      {
        secretName,
        secretValue,
        environment: ENVIRONMENT,
        type: 'shared',
        secretPath: '/'
      },
      {
        headers: {
          'Authorization': `Bearer ${INFISICAL_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ ${secretName}`);
    return true;
  } catch (error) {
    // If creation fails, try to update
    try {
      await axios.patch(
        `${INFISICAL_URL}/api/v3/secrets/${secretName}`,
        {
          secretValue,
          secretPath: '/'
        },
        {
          headers: {
            'Authorization': `Bearer ${INFISICAL_TOKEN}`,
            'Content-Type': 'application/json'
          },
          params: {
            environment: ENVIRONMENT
          }
        }
      );

      console.log(`✅ ${secretName} (updated)`);
      return true;
    } catch (updateError) {
      console.error(`❌ ${secretName}: ${updateError.response?.data?.message || updateError.message}`);
      return false;
    }
  }
}

async function main() {
  console.log('📝 Adding Homepage secrets to homelab-gitops project...\n');

  if (!INFISICAL_TOKEN) {
    console.error('❌ INFISICAL_TOKEN not set\n');
    console.log('Please set the homelab-gitops token:');
    console.log('  export INFISICAL_TOKEN="st.650cfc13-6ecd-4a3b-91cc-8d7a123b67c4..."\n');
    console.log('Then run:');
    console.log('  node add-homepage-secrets.js\n');
    process.exit(1);
  }

  console.log(`Environment: ${ENVIRONMENT}`);
  console.log(`Infisical URL: ${INFISICAL_URL}\n`);

  let successCount = 0;
  let failCount = 0;

  for (const [secretName, secretValue] of Object.entries(secrets)) {
    const success = await addSecret(secretName, secretValue);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`\n✅ Successfully added/updated ${successCount} secrets`);
  if (failCount > 0) {
    console.log(`❌ Failed to add ${failCount} secrets`);
  }

  console.log('\nNext steps:');
  console.log('1. Verify secrets in Infisical web UI:');
  console.log('   https://infisical.internal.lakehouse.wtf');
  console.log('2. Update Homepage to use Infisical for credentials');
  console.log('3. Remove hardcoded credentials from systemd service\n');
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
