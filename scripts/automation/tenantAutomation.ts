// scripts/automation/tenantAutomation.ts
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

type AutomationCommand =
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

async function handleCommand(cmd: AutomationCommand) {
  switch (cmd.type) {
    case 'createTenantWithKey': {
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

    case 'createKeyForTenant': {
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

    default:
      throw new Error('Unsupported command');
  }
}

async function main() {
  // Parse a JSON command from CLI args (for now).
  // Example:
  //   node scripts/automation/tenantAutomation.js '{"type":"createTenantWithKey","name":"Acme","slug":"acme"}'
  const raw = process.argv[2];

  if (!raw) {
    console.error(
      'Usage: node tenantAutomation.js \'<json-command>\'\nExample:\n  node tenantAutomation.js \'{"type":"createTenantWithKey","name":"Acme","slug":"acme"}\'',
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
