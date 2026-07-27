import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { listArticlesLite } from '../../../lib/articles'
import { commentCounts } from '../../../lib/comments'
import { listSubscribers } from '../../../lib/subscribers'
import { listPlan } from '../../../lib/plan'
import { unreadMessages } from '../../../lib/messages'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 20 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  try {
    const safe = async <T>(p: Promise<T>, fb: T): Promise<T> => { try { return await p } catch { return fb } }
    const [articles, comments, subs, plan, msgUnread] = await Promise.all([
      safe(listArticlesLite(), [] as any[]),
      safe(commentCounts(), { pending: 0, approved: 0, spam: 0 }),
      safe(listSubscribers(), [] as any[]),
      safe(listPlan(), [] as any[]),
      safe(unreadMessages(), 0),
    ])
    return res.status(200).json({
      messagesUnread: msgUnread,
      articles: {
        total: articles.length,
        published: articles.filter(a => a.status === 'published').length,
        draft: articles.filter(a => a.status === 'draft').length,
        scheduled: articles.filter(a => a.status === 'scheduled').length,
      },
      comments,
      subscribers: subs.length,
      planPending: plan.filter(p => p.status === 'pending').length,
      recentArticles: articles.slice(0, 5).map(a => ({ title: a.title, status: a.status, date: a.publish_at || a.created_at })),
    })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
