import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import ApiKeysClient from './ApiKeysClient'

export default async function ApiKeysPage() {
  const user = await getSessionUser()

  if (!user) redirect('/login?next=/settings/api-keys')
  if (user.role !== 'ADMIN') redirect('/')

  return <ApiKeysClient />
}
