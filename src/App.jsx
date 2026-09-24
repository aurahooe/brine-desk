import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

function hourKey(d = new Date()) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}`
}

export default function App() {
  const [session, setSession] = useState(null)
  const [tab, setTab] = useState('wall')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMsg, setAuthMsg] = useState('')
  const [notes, setNotes] = useState([])
  const [mine, setMine] = useState([])
  const [edition, setEdition] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [busy, setBusy] = useState(false)
  const nowKey = useMemo(() => hourKey(), [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    loadPublic()
    loadEdition()
  }, [])

  useEffect(() => {
    if (session?.user) loadMine(session.user.id)
    else setMine([])
  }, [session])

  async function loadPublic() {
    const { data } = await supabase
      .from('brine_notes')
      .select('id,title,body,created_at,author_id')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(40)
    setNotes(data || [])
  }

  async function loadMine(uid) {
    const { data } = await supabase
      .from('brine_notes')
      .select('*')
      .eq('author_id', uid)
      .order('created_at', { ascending: false })
    setMine(data || [])
  }

  async function loadEdition() {
    const { data } = await supabase.from('brine_hours').select('*').eq('hour_key', hourKey()).maybeSingle()
    setEdition(data)
  }

  async function signUp(e) {
    e.preventDefault()
    setAuthMsg('')
    const { error } = await supabase.auth.signUp({ email, password })
    setAuthMsg(error ? error.message : 'Check your inbox if confirmations are on, then sign in.')
  }

  async function signIn(e) {
    e.preventDefault()
    setAuthMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setAuthMsg(error ? error.message : '')
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function saveSlip(e) {
    e.preventDefault()
    if (!session) return setTab('desk')
    setBusy(true)
    const { error } = await supabase.from('brine_notes').insert({
      author_id: session.user.id,
      title: title.trim(),
      body: body.trim(),
      is_public: isPublic,
    })
    setBusy(false)
    if (error) return setAuthMsg(error.message)
    setTitle('')
    setBody('')
    await loadPublic()
    await loadMine(session.user.id)
    setTab(isPublic ? 'wall' : 'desk')
  }

  async function togglePublic(note) {
    await supabase.from('brine_notes').update({ is_public: !note.is_public, updated_at: new Date().toISOString() }).eq('id', note.id)
    await loadPublic()
    if (session) await loadMine(session.user.id)
  }

  async function removeNote(note) {
    await supabase.from('brine_notes').delete().eq('id', note.id)
    await loadPublic()
    if (session) await loadMine(session.user.id)
  }

  return (
    <div className="shell">
      <div className="grain" aria-hidden="true" />
      <header className="mast">
        <div>
          <p className="kicker">Vol. I · hour {nowKey.slice(-2)} UTC</p>
          <h1>Brine Desk</h1>
          <p className="lede">A small press that turns over every hour. Write a slip. Mark it public and it walks onto the wall.</p>
        </div>
        <nav>
          <button className={tab === 'wall' ? 'on' : ''} onClick={() => setTab('wall')}>Wall</button>
          <button className={tab === 'desk' ? 'on' : ''} onClick={() => setTab('desk')}>Desk</button>
        </nav>
      </header>

      <section className="edition rise">
        <span className="stamp">This hour</span>
        <h2>{edition?.headline || 'The desk is still warming the press.'}</h2>
        <p>{edition?.blurb || 'A new edition lands on the hour. Public slips may be pulled into the lead.'}</p>
      </section>

      {tab === 'wall' && (
        <main className="grid">
          {notes.length === 0 && <p className="empty">No public slips yet. Sit at the desk and send one out.</p>}
          {notes.map((n, i) => (
            <article key={n.id} className="card" style={{ animationDelay: `${i * 40}ms` }}>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
              <time>{new Date(n.created_at).toLocaleString()}</time>
            </article>
          ))}
        </main>
      )}

      {tab === 'desk' && (
        <main className="desk">
          {!session && (
            <form className="auth card" onSubmit={signIn}>
              <h2>Sign the ledger</h2>
              <p>Email and password. Everything you write is saved. Public slips appear on the wall.</p>
              <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>
              {authMsg && <p className="msg">{authMsg}</p>}
              <div className="row">
                <button type="submit">Sign in</button>
                <button type="button" className="ghost" onClick={signUp}>Create account</button>
              </div>
            </form>
          )}

          {session && (
            <>
              <form className="compose card" onSubmit={saveSlip}>
                <div className="row between">
                  <h2>New slip</h2>
                  <button type="button" className="ghost" onClick={signOut}>Sign out</button>
                </div>
                <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required /></label>
                <label>Body<textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} required rows={8} /></label>
                <label className="check">
                  <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                  Mark public — show it on the wall
                </label>
                <button disabled={busy} type="submit">{busy ? 'Saving…' : 'File the slip'}</button>
              </form>

              <section>
                <h2 className="sub">Your cabinet</h2>
                {mine.length === 0 && <p className="empty">Nothing filed yet.</p>}
                {mine.map((n) => (
                  <article key={n.id} className="card slim">
                    <div className="row between">
                      <h3>{n.title}</h3>
                      <span className={n.is_public ? 'pill on' : 'pill'}>{n.is_public ? 'public' : 'private'}</span>
                    </div>
                    <p>{n.body}</p>
                    <div className="row">
                      <button type="button" className="ghost" onClick={() => togglePublic(n)}>
                        {n.is_public ? 'Make private' : 'Make public'}
                      </button>
                      <button type="button" className="ghost danger" onClick={() => removeNote(n)}>Delete</button>
                    </div>
                  </article>
                ))}
              </section>
            </>
          )}
        </main>
      )}

      <footer>
        <p>Brine Desk reprints itself on the hour. Private slips stay in the cabinet.</p>
      </footer>
    </div>
  )
}
