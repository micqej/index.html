import type { NextApiRequest, NextApiResponse } from 'next'
import { publicSite } from '../../../lib/siteSettings'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 10 }

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    return res.status(200).json(await publicSite())
  } catch {
    return res.status(200).json({ gaId: '', metaPixelId: '', gtmId: '', headHtml: '', commentsEnabled: false, recaptchaSiteKey: '' })
  }
}
