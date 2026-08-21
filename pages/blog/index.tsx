import { useState } from 'react'
import Link from 'next/link'
import Nav from '../../components/Nav'
import Footer from '../../components/Footer'
import PostCard from '../../components/PostCard'
import SEO from '../../components/SEO'
import { getAllPosts, mergePosts, categoriesFrom, Post } from '../../lib/posts'
import { getPublishedPosts } from '../../lib/articles'
import { SITE_URL } from '../../lib/site'

interface Props {
  posts: Post[]
  categories: { name: string; count: number }[]
}

const PER_PAGE = 11

export default function Blog({ posts, categories }: Props) {
  const [activeCategory, setActiveCategory] = useState('Všetky')
  const [page, setPage] = useState(1)

  const filtered = activeCategory === 'Všetky'
    ? posts
    : posts.filter(p => p.categories.includes(activeCategory))

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const handleCategory = (cat: string) => {
    setActiveCategory(cat)
    setPage(1)
  }

  return (
    <>
      <SEO
        title="Blog — Tipy z digitálneho marketingu"
        description="Praktické tipy o cold emailoch, SEO, sociálnych médiách a tvorbe webov pre slovenské firmy. Overené stratégie z praxe."
        canonical={`${SITE_URL}/blog/`}
      />
      <Nav />

      {/* HERO */}
      <div className="archive-hero">
        <div>
          <div className="section-label">Všetky články</div>
          <h1 className="archive-title">
            BLOG<br /><span className="outline">&amp; TIPY</span>
          </h1>
        </div>
        <p className="archive-desc">
          Pravidelné tipy z praxe o cold emailoch, SEO, sociálnych médiách a tvorbe webov. Žiadna teória — len to, čo skutočne funguje.
          <br /><br />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '2px', color: 'var(--acid)' }}>
            {posts.length} ČLÁNKOV
          </span>
        </p>
      </div>

      {/* FILTER */}
      <div className="filter-bar">
        <button
          className={`filter-btn ${activeCategory === 'Všetky' ? 'active' : ''}`}
          onClick={() => handleCategory('Všetky')}
        >
          Všetky ({posts.length})
        </button>
        {categories.slice(0, 14).map(cat => (
          <button
            key={cat.name}
            className={`filter-btn ${activeCategory === cat.name ? 'active' : ''}`}
            onClick={() => handleCategory(cat.name)}
          >
            {cat.name} ({cat.count})
          </button>
        ))}
      </div>

      {/* POSTS GRID */}
      <div className="posts-grid" style={{ marginTop: 2, marginBottom: 2 }}>
        {paginated.length === 0 && (
          <div style={{ padding: '80px 40px', color: 'var(--muted)', gridColumn: '1/-1' }}>
            Žiadne články v tejto kategórii.
          </div>
        )}
        {paginated.slice(0, 1).map(p => (
          <PostCard key={p.id} post={p} featured />
        ))}
        {paginated.slice(1).map(p => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="pagination">
          {page > 1 && (
            <button className="page-btn" onClick={() => setPage(p => p - 1)}>←</button>
          )}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              className={`page-btn ${n === page ? 'active' : ''}`}
              onClick={() => { setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            >
              {n}
            </button>
          ))}
          {page < totalPages && (
            <button className="page-btn" onClick={() => setPage(p => p + 1)}>→</button>
          )}
        </div>
      )}

      {/* NEWSLETTER */}
      <div className="newsletter">
        <div>
          <div className="section-label">Newsletter</div>
          <h2 className="newsletter-title">Tipy priamo<br />do <span>inboxu.</span></h2>
        </div>
        <div>
          <p style={{ color: 'var(--muted-on-y)', marginBottom: '22px', lineHeight: '1.7' }}>
            Každý týždeň jeden tip z praxe. Bez spamu, len obsah, ktorý používate hneď.
          </p>
          <form className="newsletter-form"
            /* čas načítania formulára — stanoví sa až v prehliadači, do statickej stránky sa nezapečie */
            ref={el => { if (el && !el.dataset.t) el.dataset.t = String(Date.now()) }}
            onSubmit={async e => {
            e.preventDefault()
            const form = e.currentTarget
            const input = form.querySelector('input.newsletter-input') as HTMLInputElement | null
            const navnada = form.querySelector('input[name="website"]') as HTMLInputElement | null
            const email = input?.value
            if (!email) return
            try { await fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, source: 'blog', website: navnada?.value || '', ts: Number(form.dataset.t) || 0 }) }); if (input) input.value = ''; alert('Ďakujeme! Prihlásili sme vás.') } catch {}
          }}>
            <input className="newsletter-input" type="email" placeholder="váš@email.sk" required />
            {/* návnada pre boty: človek toto pole nevidí, bot ho vyplní a tým sa prezradí */}
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
            <button type="submit" className="newsletter-submit">Prihlásiť →</button>
          </form>
        </div>
      </div>

      <Footer />
    </>
  )
}

export async function getStaticProps() {
  const posts = mergePosts(getAllPosts(), await getPublishedPosts())
  const categories = categoriesFrom(posts)
  return {
    props: { posts, categories },
    revalidate: 60,
  }
}
