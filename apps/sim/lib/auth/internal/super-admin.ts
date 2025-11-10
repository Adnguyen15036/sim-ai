import { db } from '@sim/db'
import { user } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { env } from '@/lib/env'

export type SuperAdminUser = {
  id: string
  email: string
  name: string
  image: string | null
  emailVerified: boolean
  createdAt: Date
  updatedAt: Date
}

export async function getSuperAdminUser(): Promise<SuperAdminUser | null> {
  const email = env.SUPER_ADMIN_EMAIL
  if (!email) return null

  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  return rows[0] || null
}


