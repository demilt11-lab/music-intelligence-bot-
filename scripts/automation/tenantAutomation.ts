// scripts/automation/tenantAutomation.ts
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

type AutomationCommand =
  | {
      type: 'createTenantPair';
      baseName: string;      // e.g. "Acme Label"
      baseSlug: string;      // e.g. "acme"
      sandboxLabel?: string; // default: "<baseName> Sandbox"
      prodLabel?: string;    // default: "<baseName> Production"
      sandboxScopes?: string;
      prodScopes?: string;
    }
  | {
      type: 'createTenantWithKey';
      name: string;
      slug: string;
      label?: string;
      scopes?: string;
    }
  | {
      type: 'createKeyForTenant';
      tenantId: number;
      label?: string;
      scopes?: string;
    };

function generateApiKey(): { raw: string; hash: string } {
  const raw = `mi_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

async function createTenantWithKey(cmd: {
  name: string;
  slug: string;
  label?: string;
  scopes?: string;
}) {
  const tenant = await prisma.tenant.create({
    data: {
      name: cmd.name,
      slug: cmd.slug,
    },
  });

  const { raw, hash } = generateApiKey();

  const scopes =
    cmd.scopes ??
    'search:read,tracks:read,tracks:charts:read,tracks:radio:read,catalog:write';

  await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      keyHash: hash,
      label: cmd.label ?? 'Default API key',
      scopes,
    },
  });

  return {
    tenant,
    apiKey: raw,
    scopes,
  };
}

async function createKeyForTenant(cmd: {
  tenantId: number;
  label?: string;
  scopes?: string;
}) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: cmd.tenantId },
  });

  if (!tenant) {
    throw new Error(`Tenant ${cmd.tenantId} not found`);
  }

  const { raw, hash } = generateApiKey();

  const scopes =
    cmd.scopes ??
    'search:read,tracks:read,tracks:charts:read,tracks:radio:read,catalog:write';

  const key = await prisma.apiKey.create({
    data: {
      tenantId: cmd.tenantId,
      keyHash: hash,
      label: cmd.label ?? 'API key',
      scopes,
    },
  });

  return {
    tenant,
    apiKeyRecord: key,
    apiKey: raw,
    scopes,
  };
}

async function handleCommand(cmd: AutomationCommand) {
  switch (cmd.type) {
    case 'createTenantPair': {
      const sandboxName = `${cmd.baseName} Sandbox`;
      const prodName = `${cmd.baseName} Production`;

      const sandboxSlug = `${cmd.baseSlug}-sandbox`;
      const prodSlug = `${cmd.baseSlug}-prod`;

      const sandboxLabel =
        cmd.sandboxLabel ?? `${cmd.baseName} Sandbox Key`;
      const prodLabel =
        cmd.prodLabel ?? `${cmd.baseName} Prod Key`;

      const sandboxScopes =
        cmd.sandboxScopes ??
        'search:read,tracks:read,tracks:charts:read,tracks:radio:read,catalog:write';
      const prodScopes =
        cmd.prodScopes ??
        'search:read,tracks:read,tracks:charts:read,tracks:radio:read,catalog:write';

      const sandbox = await createTenantWithKey({
        name: sandboxName,
        slug: sandboxSlug,
        label: sandboxLabel,
        scopes: sandboxScopes,
      });

      const prod = await createTenantWithKey({
        name: prodName,
        slug: prodSlug,
        label: prodLabel,
        scopes: prodScopes,
      });

      return {
        sandboxTenant: {
          id: sandbox.tenant.id,
          name: sandbox.tenant.name,
          slug: sandbox.tenant.slug,
          apiKey: sandbox.apiKey,
          scopes: sandbox.scopes,
        },
        prodTenant: {
          id: prod.tenant.id,
          name: prod.tenant.name,
          slug: prod.tenant.slug,
          apiKey: prod.apiKey,
          scopes: prod.scopes,
        },
      };
    }

    case 'createTenantWithKey':
      return createTenantWithKey(cmd);

    case 'createKeyForTenant':
      return createKeyForTenant(cmd);

    default:
      throw new Error('Unsupported command');
  }
}

async function main() {
  // Example:
  // node scripts/automation/tenantAutomation.js '{"type":"createTenantPair","baseName":"Acme Label","baseSlug":"acme"}'
  const raw = process.argv[2];

  if (!raw) {
    console.error(
      'Usage: node tenantAutomation.js \'<json-command>\'\n' +
        'Example:\n' +
        '  node tenantAutomation.js \'{"type":"createTenantPair","baseName":"Acme Label","baseSlug":"acme"}\'',
    );
    process.exit(1);
  }

  let cmd: AutomationCommand;
  try {
    cmd = JSON.parse(raw) as AutomationCommand;
  } catch {
    console.error('Invalid JSON command');
    process.exit(1);
  }

  try {
    const result = await handleCommand(cmd);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
