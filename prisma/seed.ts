import { PrismaClient } from '@prisma/client'
import * as crypto from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const raw = 'mib_test_00000000000000000000000000000000'
  const keyHash = crypto.createHash('sha256').update(raw).digest('hex')

  await prisma.apiKey.upsert({
    where: { keyHash },
    update: {},
    create: {
      keyHash,
      name: 'test-key',
      ownerId: 'seed',
      scopes: ['trajectory:read', 'signals:write'],
    },
  })

  console.log('Seed complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
