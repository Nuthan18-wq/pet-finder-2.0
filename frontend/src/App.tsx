import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  CalendarDays,
  CheckCheck,
  CircleHelp,
  Download,
  Globe2,
  Heart,
  ImagePlus,
  LogOut,
  MapPin,
  MapPinned,
  Menu,
  MessageCircle,
  Moon,
  PawPrint,
  Plus,
  Send,
  Sparkles,
  Sun,
  ScanSearch,
  Search,
  Shield,
  Upload,
  X,
} from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { LatLngTuple } from 'leaflet'
import type * as Leaflet from 'leaflet'
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

type User = {
  id: string
  full_name: string
  email: string
  role: string
}

type Session = {
  token: string
  user: User
}

type AIAnalysis = {
  animal_type?: string
  colours?: string
  fur_pattern?: string
  visible_markings?: string
  approximate_breed?: string
  visible_accessories?: string
  description?: string
  confidence_note?: string
}

type Pet = {
  id: string
  user_id?: string
  pet_name: string
  pet_type: string
  breed: string
  colour: string
  image: string
  location: string
  date: string
  created_at?: string
  latitude?: number
  longitude?: number
  location_shared?: boolean
  status: 'Lost' | 'Found' | 'Potential Match' | 'Reunited' | 'Closed'
  description: string
  owner_name?: string
  ai_analysis?: AIAnalysis | null
  viewer_is_owner?: boolean
}

type Match = {
  id: string
  lost_pet_id?: string
  found_pet_id?: string
  similarity_score: number
  similarity_percentage: number
  confidence_badge: string
  disclaimer: string
  distance_km?: number
  date_difference_days?: number
  matching_characteristics: Array<{ characteristic: string; value: string }>
  found_pet?: Pet
  lost_pet?: Pet
}

type Conversation = {
  id: string
  participant_details: User[]
  pet_details?: { pet_name?: string; image?: string }
  last_message?: { message?: string }
  unread_count: number
}

type ChatMessage = {
  id: string
  sender_id: string
  sender_name?: string
  message: string
  attachment?: string | null
  timestamp: string
  read_status?: boolean
}

type MapReportsResponse = { pets: Pet[]; total: number }
type DashboardOverview = {
  stats: { total_lost_pets: number; total_found_pets: number; potential_ai_matches: number; reunited_pets: number }
  activity_by_status: Record<string, number>
  recent_reports: Pet[]
  my_reports: Pet[]
  recent_matches: Match[]
  unread_notifications: number
}

type AuthContextValue = {
  session: Session | null
  saveSession: (value: Session) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('Authentication context is missing.')
  return context
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const token = localStorage.getItem('petfinder-token')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers })
  if (!response.ok) {
    let message = `Request failed (${response.status}).`
    try {
      const body = await response.json() as { detail?: string }
      if (body.detail) message = body.detail
    } catch {
      // Keep the HTTP status message when the server does not return JSON.
    }
    throw new Error(message)
  }
  return await response.json() as T
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const token = localStorage.getItem('petfinder-token')
    const savedUser = localStorage.getItem('petfinder-user')
    if (!token || !savedUser) return null
    try {
      return { token, user: JSON.parse(savedUser) as User }
    } catch {
      localStorage.removeItem('petfinder-token')
      localStorage.removeItem('petfinder-user')
      return null
    }
  })

  const saveSession = (value: Session) => {
    localStorage.setItem('petfinder-token', value.token)
    localStorage.setItem('petfinder-user', JSON.stringify(value.user))
    setSession(value)
  }
  const signOut = () => {
    localStorage.removeItem('petfinder-token')
    localStorage.removeItem('petfinder-user')
    setSession(null)
  }

  return <AuthContext.Provider value={{ session, saveSession, signOut }}>{children}</AuthContext.Provider>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  )
}

function AppShell() {
  const { session, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('petfinder-theme') === 'dark' ? 'dark' : 'light')
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const navItems = [
    { label: 'Find pets', to: '/find-pets' },
    { label: 'Live map', to: '/map' },
    { label: 'Reunions', to: '/reunions' },
    { label: 'AI assistant', to: '/assistant' },
  ]

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('petfinder-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!session) { setUnreadNotifications(0); return }
    let active = true
    const refresh = () => apiRequest<{ unread_count: number }>('/api/notifications').then((response) => {
      if (active) setUnreadNotifications(response.unread_count)
    }).catch(() => undefined)
    void refresh()
    const interval = window.setInterval(() => { void refresh() }, 30000)
    return () => { active = false; window.clearInterval(interval) }
  }, [session])

  return (
    <div className="min-h-screen bg-[#f7f9f5] text-slate-800 antialiased">
      <header className="sticky top-0 z-50 border-b border-emerald-100/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Pet-Finder home">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-900/10">
              <PawPrint className="h-5 w-5" />
            </span>
            <span className="text-[17px] font-extrabold tracking-tight text-slate-900">petfinder<span className="text-emerald-700">.</span></span>
          </Link>

          <nav className="hidden items-center gap-7 xl:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? 'text-emerald-800' : 'text-slate-600 hover:text-emerald-700'}`
              }>{item.label}</NavLink>
            ))}
            {session && <NavLink to="/visual-search" className={({ isActive }) => `text-sm font-medium transition-colors ${isActive ? 'text-emerald-800' : 'text-slate-600 hover:text-emerald-700'}`}>Visual search</NavLink>}
            {session && <NavLink to="/poster" className={({ isActive }) => `text-sm font-medium transition-colors ${isActive ? 'text-emerald-800' : 'text-slate-600 hover:text-emerald-700'}`}>Posters</NavLink>}
            {session && <NavLink to="/dashboard" className={({ isActive }) =>
              `text-sm font-medium transition-colors ${isActive ? 'text-emerald-800' : 'text-slate-600 hover:text-emerald-700'}`
            }>My dashboard</NavLink>}
            {session?.user.role === 'admin' && <NavLink to="/admin" className="text-sm font-medium text-slate-600 hover:text-emerald-700">Admin</NavLink>}
          </nav>

          <div className="hidden items-center gap-2.5 xl:flex">
            {session && <Link to="/notifications" aria-label="Notifications" className="relative rounded-full border border-slate-200 p-2.5 text-slate-600 hover:border-emerald-300 hover:text-emerald-800">
              <Bell className="h-4 w-4" />
              {unreadNotifications > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-700 px-1 text-[9px] font-bold text-white">{unreadNotifications}</span>}
            </Link>}
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} className="rounded-full border border-slate-200 p-2.5 text-slate-600 hover:border-emerald-300 hover:text-emerald-800">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {session ? (
              <>
                <span className="max-w-36 truncate text-sm font-medium text-slate-600">Hi, {session.user.full_name.split(' ')[0]}</span>
                <button onClick={signOut} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-800">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/auth" className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:text-emerald-800">Log in</Link>
                <Link to="/auth?mode=register" className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/10 transition hover:bg-emerald-800">Create account</Link>
              </>
            )}
          </div>
          <button onClick={() => setMobileOpen((open) => !open)} className="rounded-xl p-2 text-slate-700 xl:hidden" aria-label="Toggle navigation">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileOpen && (
          <nav className="grid gap-1 border-t border-slate-100 bg-white px-4 py-3 xl:hidden">
            {navItems.map((item) => <Link key={item.to} onClick={() => setMobileOpen(false)} to={item.to} className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-emerald-50">{item.label}</Link>)}
            {session && <Link onClick={() => setMobileOpen(false)} to="/dashboard" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-emerald-50">My dashboard</Link>}
            {session && <Link onClick={() => setMobileOpen(false)} to="/visual-search" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-emerald-50">AI visual search</Link>}
            {session && <Link onClick={() => setMobileOpen(false)} to="/poster" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-emerald-50">Poster studio</Link>}
            {session && <Link onClick={() => setMobileOpen(false)} to="/notifications" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-emerald-50">Notifications {unreadNotifications > 0 ? `(${unreadNotifications})` : ''}</Link>}
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-emerald-50">{theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}</button>
            {session ? <button onClick={() => { signOut(); setMobileOpen(false) }} className="px-3 py-2.5 text-left text-sm font-medium text-slate-700">Sign out</button> : <Link onClick={() => setMobileOpen(false)} to="/auth" className="px-3 py-2.5 text-sm font-medium text-emerald-800">Log in / Sign up</Link>}
          </nav>
        )}
      </header>

      <main>
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/find-pets" element={<FindPetsPage />} />
            <Route path="/map" element={<LiveMapPage />} />
            <Route path="/visual-search" element={<VisualSearchPage />} />
            <Route path="/report-lost" element={<ReportPetPage mode="lost" />} />
            <Route path="/report-found" element={<ReportPetPage mode="found" />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/matches" element={<MatchResultsPage />} />
            <Route path="/pets/:petId" element={<PetDetailsPage />} />
            <Route path="/chat/:conversationId?" element={<ChatPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/poster" element={<PosterStudioPage />} />
            <Route path="/reunions" element={<ReunionsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AnimatePresence>
      </main>
      <PawAssistant />
      <footer className="mt-20 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Link to="/" className="font-bold text-slate-800">petfinder<span className="text-emerald-700">.</span></Link>
          <p>AI can suggest a potential match, but only careful verification can confirm identity.</p>
          <Link to="/assistant" className="font-medium text-emerald-800 hover:text-emerald-950">Need help?</Link>
        </div>
      </footer>
    </div>
  )
}

function PageMotion({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className={className}>{children}</motion.div>
}

function usePets(endpoint = '/api/pets/all') {
  const [pets, setPets] = useState<Pet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    apiRequest<Pet[]>(endpoint).then((items) => {
      if (active) setPets(items)
    }).catch((reason: Error) => {
      if (active) setError(reason.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [endpoint])
  return { pets, loading, error }
}

function HomePage() {
  const { pets, loading, error } = usePets()
  const lostCount = pets.filter((pet) => pet.status === 'Lost').length
  const foundCount = pets.filter((pet) => pet.status === 'Found').length
  const reunions = pets.filter((pet) => pet.status === 'Reunited').length
  const featured = pets.slice(0, 3)

  return (
    <PageMotion>
      <section className="relative isolate overflow-hidden bg-[#071713] text-white">
        <div className="pointer-events-none absolute -right-36 -top-40 h-[34rem] w-[34rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 left-1/4 h-[28rem] w-[28rem] rounded-full bg-lime-400/10 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-[1fr_0.92fr] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-20">
        <div className="relative z-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-300/10 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-200 shadow-sm backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5" /> Pet-Finder rescue network
          </div>
          <h1 className="max-w-2xl text-[2.75rem] font-black leading-[1.02] tracking-[-0.055em] text-white sm:text-6xl lg:text-[4.25rem]">
            Every Paw Has a Way <span className="text-emerald-300">Home.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-emerald-50/75 sm:text-lg">
            An intelligent rescue network powered by Generative AI, computer vision and real-time community connections.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/report-lost" className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3.5 text-sm font-bold text-emerald-950 shadow-lg shadow-emerald-900/25 transition hover:-translate-y-0.5 hover:bg-emerald-300">
              I lost a pet <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/report-found" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-bold text-white transition hover:border-emerald-300/50 hover:bg-white/10">
              I found a pet
            </Link>
          </div>
          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3 border-t border-white/10 pt-6">
            {[
              { label: 'Lost reports', value: lostCount },
              { label: 'Found reports', value: foundCount },
              { label: 'Reunited', value: reunions },
            ].map((stat) => <div key={stat.label}>
              <p className="text-2xl font-black tracking-tight text-white">{loading ? '—' : stat.value}</p>
              <p className="mt-1 text-xs font-medium text-emerald-100/55">{stat.label}</p>
            </div>)}
          </div>
          {error && <p className="mt-3 text-xs text-emerald-100/60">Live case totals are temporarily unavailable.</p>}
        </div>

        <div className="relative mx-auto w-full max-w-[570px]">
          <div className="absolute -left-8 top-12 h-36 w-36 rounded-full bg-lime-200/30 blur-3xl" />
          <div className="absolute -bottom-6 -right-5 h-40 w-40 rounded-full bg-emerald-300/30 blur-3xl" />
          <div className="relative rounded-[2rem] border border-white/15 bg-white/5 p-2.5 shadow-[0_35px_90px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <div className="relative overflow-hidden rounded-[1.5rem]">
              <img src="https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1400&q=85" alt="A dog and a cat sitting together in a sunny garden" className="h-[390px] w-full object-cover sm:h-[500px]" />
              <div className="hero-scan-line" aria-hidden="true" />
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/30 bg-slate-950/45 px-3 py-2 text-xs font-semibold text-white backdrop-blur-md">
                <ScanSearch className="h-4 w-4 text-emerald-300" /> Visual search, when you need it
              </div>
            </div>
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} className="absolute -right-3 top-24 hidden rounded-2xl border border-white/20 bg-[#10251f]/90 p-3 shadow-2xl backdrop-blur-xl sm:block">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Computer vision</p>
              <p className="mt-1 text-xs font-semibold text-white">Image embeddings → similarity</p>
            </motion.div>
            <div className="absolute bottom-7 left-7 right-7 rounded-2xl border border-white/60 bg-white/90 p-4 shadow-xl backdrop-blur-md sm:bottom-9 sm:left-9 sm:right-9">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"><Heart className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">A little more than a photo</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-600">Visual signals, useful details, and a safer way to reach out.</p>
                </div>
                <BadgeCheck className="ml-auto h-5 w-5 shrink-0 text-emerald-700" />
              </div>
            </div>
          </div>
        </div>
        </div>
      </section>

      <section className="border-y border-emerald-100 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="A clearer path forward" title="Three thoughtful steps. One familiar face." />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { no: '01', icon: Upload, title: 'Share a clear photo', text: 'Add a recent photograph, where the pet was last seen or found, and the details that matter.' },
              { no: '02', icon: Sparkles, title: 'Compare visually', text: 'OpenCLIP embeddings rank real uploaded images by cosine similarity. Gemini can describe visible features.' },
              { no: '03', icon: MessageCircle, title: 'Verify together', text: 'Use authenticated private chat to compare markings and plan a safe next step.' },
            ].map((step) => <motion.article whileHover={{ y: -4 }} key={step.no} className="rounded-3xl border border-slate-200 bg-[#fbfcfa] p-6 sm:p-7">
              <div className="flex items-center justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><step.icon className="h-5 w-5" /></span><span className="text-sm font-bold text-emerald-700">{step.no}</span></div>
              <h3 className="mt-6 text-lg font-bold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
            </motion.article>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <SectionHeading eyebrow="Live community reports" title="Every photo is a new possibility." />
          <Link to="/find-pets" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-800 hover:text-emerald-950">Browse reports <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
        {loading ? <Loading text="Loading community reports…" /> : error ? <ErrorNotice message={error} /> : featured.length ? (
          <div className="mt-8 grid gap-5 md:grid-cols-3">{featured.map((pet) => <PetCard key={pet.id} pet={pet} />)}</div>
        ) : <EmptyState title="The community is just getting started" text="Be the first to report a lost or found pet and help build a local network." action={<div className="flex gap-2"><Link className="btn-primary" to="/report-lost">Report a lost pet</Link><Link className="btn-secondary" to="/report-found">Report a found pet</Link></div>} />}
      </section>
    </PageMotion>
  )
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">{eyebrow}</p><h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{title}</h2></div>
}

function HowItWorksPage() {
  return <PageMotion className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
    <SectionHeading eyebrow="How it works" title="From a photo to a safer reunion." />
    <p className="mt-4 max-w-2xl leading-7 text-slate-600">Pet-Finder pairs computer vision with clear reporting and private communication. AI can point to promising similarities; it never confirms an animal’s identity.</p>
    <div className="mt-10 grid gap-5 md:grid-cols-3">
      {[
        ['01', 'Create a report', 'Register or log in, upload the pet’s photograph, and include the location and date. Clear, well-lit photos help.'],
        ['02', 'Review visual matches', 'OpenCLIP generates an image embedding and ranks opposite-status reports using cosine similarity. Scores are computed from the actual images.'],
        ['03', 'Talk and verify', 'Only the two report owners can start a match conversation. Compare unique markings, ask questions, and arrange a safe handover.'],
      ].map(([number, title, text]) => <article key={number} className="rounded-3xl border border-slate-200 bg-white p-7"><span className="text-sm font-extrabold text-emerald-700">{number}</span><h2 className="mt-4 text-xl font-bold text-slate-900">{title}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{text}</p></article>)}
    </div>
    <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><strong>AI results are potential matches, not confirmed identities.</strong> Verify distinguishing features, check ownership independently, and meet in a public place.</div>
  </PageMotion>
}

function PetImage({ pet, className = '' }: { pet: Pet; className?: string }) {
  const { session } = useAuth()
  const [source, setSource] = useState('')
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setSource('')
    setUnavailable(false)
    if (!session || !pet.image?.startsWith('/api/pets/')) {
      setUnavailable(true)
      return
    }
    fetch(`${API_BASE}${pet.image}`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then((response) => {
        if (!response.ok) throw new Error('Pet photograph unavailable.')
        return response.blob()
      })
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setSource(objectUrl)
      })
      .catch(() => { if (active) setUnavailable(true) })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [pet.id, pet.image, session?.token])

  if (!source) return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-emerald-50 to-lime-100 text-emerald-800 ${className}`} aria-label={unavailable ? 'Private pet photograph' : 'Loading pet photograph'}>
      {unavailable ? <Shield className="h-7 w-7 opacity-60" /> : <span className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />}
    </div>
  )
  return <img src={source} alt={`${pet.pet_name || 'Pet'} photograph`} className={className} loading="lazy" />
}

function PetCard({ pet }: { pet: Pet }) {
  return <article className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/5">
    <Link to={`/pets/${pet.id}`} className="block"><PetImage pet={pet} className="h-56 w-full object-cover transition duration-500 group-hover:scale-[1.02]" /></Link>
    <div className="p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-bold text-slate-900">{pet.pet_name || 'Pet'}</p><p className="mt-1 text-sm text-slate-500">{pet.pet_type} · {pet.breed || 'Breed unknown'}</p></div><StatusBadge status={pet.status} /></div>
      <div className="mt-4 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4 text-emerald-700" /><span className="truncate">{pet.location}</span></div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-xs text-slate-500">{pet.date}</span><Link to={`/pets/${pet.id}`} className="text-sm font-bold text-emerald-800 hover:text-emerald-950">View report <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></Link></div>
    </div>
  </article>
}

function StatusBadge({ status }: { status: string }) {
  const style = status === 'Lost' ? 'bg-rose-50 text-rose-700' : status === 'Found' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${style}`}>{status}</span>
}

function FindPetsPage() {
  const { pets, loading, error } = usePets()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const filtered = useMemo(() => pets.filter((pet) => {
    const matchesStatus = status === 'All' || pet.status === status
    const text = `${pet.pet_name} ${pet.pet_type} ${pet.breed} ${pet.colour} ${pet.location}`.toLowerCase()
    return matchesStatus && text.includes(query.toLowerCase())
  }), [pets, query, status])
  return <PageMotion className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><SectionHeading eyebrow="Community reports" title="Find a familiar face." /><Link to="/report-found" className="btn-primary"><Plus className="h-4 w-4" /> Report a found pet</Link></div>
    <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row">
      <label className="flex flex-1 items-center gap-3 rounded-xl px-3 py-2"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, breed, colour, or location" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></label>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-emerald-400"><option>All</option><option>Lost</option><option>Found</option><option>Reunited</option></select>
    </div>
    {loading ? <Loading text="Loading reports…" /> : error ? <ErrorNotice message={error} /> : filtered.length ? <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((pet) => <PetCard key={pet.id} pet={pet} />)}</div> : <EmptyState title="No reports match your search" text="Try another search or submit a report to help a pet find its way home." />}
  </PageMotion>
}

function AuthPrompt({ title = 'Sign in to continue' }: { title?: string }) {
  return <div className="mx-auto max-w-2xl py-10"><EmptyState title={title} text="Your account keeps your reports and conversations private." action={<Link to="/auth" className="btn-primary">Log in or create an account</Link>} /></div>
}

function ReportPetPage({ mode }: { mode: 'lost' | 'found' }) {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [analysis, setAnalysis] = useState<Record<string, string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [shareLocation, setShareLocation] = useState(false)
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] || null)
    setAnalysis(null)
    setAnalysisError('')
  }

  const toggleLocationSharing = (enabled: boolean) => {
    setError('')
    if (!enabled) {
      setShareLocation(false)
      setCoordinates(null)
      return
    }
    if (!navigator.geolocation) {
      setError('This browser does not support location access. You can still submit without sharing a map pin.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        setShareLocation(true)
        setLocating(false)
      },
      () => {
        setError('Location access was not granted. The report can still be submitted without a map pin.')
        setShareLocation(false)
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  const analyze = async () => {
    if (!file) { setAnalysisError('Choose a pet photograph first.'); return }
    const data = new FormData()
    data.append('image', file)
    setAnalyzing(true)
    setAnalysisError('')
    try {
      const response = await apiRequest<{ analysis: Record<string, string> }>('/api/ai/analyze-image', { method: 'POST', body: data })
      setAnalysis(response.analysis)
    } catch (reason) {
      setAnalysisError((reason as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!file) { setError('Add a photograph to create a visual match report.'); return }
    const data = new FormData(event.currentTarget)
    data.set('image', file)
    setBusy(true)
    try {
      const response = await apiRequest<{ pet: Pet }>('/api/pets/' + mode, { method: 'POST', body: data })
      navigate(`/matches?petId=${encodeURIComponent(response.pet.id)}&status=${mode === 'lost' ? 'Lost' : 'Found'}`)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!session) return <PageMotion className="mx-auto max-w-4xl px-4 py-14 sm:px-6"><SectionHeading eyebrow={mode === 'lost' ? 'Lost pet report' : 'Found pet report'} title={mode === 'lost' ? 'Let’s help them find their way home.' : 'Help a found pet get home.'} /><AuthPrompt /></PageMotion>

  return <PageMotion className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
    <SectionHeading eyebrow={mode === 'lost' ? 'Lost pet report' : 'Found pet report'} title={mode === 'lost' ? 'Tell us about your missing pet.' : 'Share a found pet report.'} />
    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">A clear photo is required. We create a real OpenCLIP image embedding to compare against reports of the opposite status. Matches are only potential leads.</p>
    <form onSubmit={submit} className="mt-7 grid gap-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-7">
      <label className="sm:col-span-2">
        <span className="mb-2 block text-sm font-bold text-slate-700">Pet photograph <span className="text-rose-600">*</span></span>
        <span className="flex min-h-52 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 text-center transition hover:border-emerald-400">
          {preview ? <span className="relative block w-full"><img src={preview} alt="Selected pet preview" className="h-60 w-full object-cover" />{(analyzing || busy) && <span className="image-scan-overlay"><span className="image-scan-bar" /><span className="absolute inset-x-0 bottom-3 text-center text-xs font-bold text-white">{analyzing ? 'Gemini is analyzing this photo…' : 'OpenCLIP is preparing visual comparison…'}</span></span>}</span> : <span className="p-8"><Upload className="mx-auto h-8 w-8 text-emerald-700" /><span className="mt-3 block text-sm font-bold text-slate-800">Choose a recent pet photo</span><span className="mt-1 block text-xs text-slate-500">JPG, PNG or WebP · up to 10 MB</span></span>}
          <input required type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} className="sr-only" />
        </span>
      </label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!file || analyzing} onClick={analyze} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-4 w-4" />{analyzing ? 'Analyzing photo…' : 'Analyze with Gemini'}</button>
        <span className="text-xs text-slate-500">Requires GEMINI_API_KEY on the backend. Image matching works independently.</span>
      </div>
      {analysisError && <p className="sm:col-span-2"><ErrorNotice message={analysisError} /></p>}
      {analysis && <div className="sm:col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-emerald-900"><Sparkles className="h-4 w-4" /> Gemini image analysis</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{analysis.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">{[analysis.animal_type, analysis.colours, analysis.fur_pattern, analysis.approximate_breed].filter(Boolean).map((tag) => <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-900">{tag}</span>)}</div>
        <p className="mt-3 text-xs text-slate-500">{analysis.confidence_note}</p>
      </div>}
      <Field label="Pet name" name="petName" required defaultValue={mode === 'lost' ? '' : 'Unknown'} placeholder={mode === 'lost' ? 'e.g. Maple' : 'Unknown'} />
      <label><span className="mb-2 block text-sm font-bold text-slate-700">Animal type</span><select name="petType" className="form-input"><option>Dog</option><option>Cat</option><option>Other</option></select></label>
      <Field label="Breed (if known)" name="breed" placeholder="e.g. mixed breed" />
      <Field label="Colour and markings" name="colour" placeholder="e.g. white paws, brindle coat" />
      <Field label="Location" name="location" required placeholder="Neighbourhood, city" />
      <Field label={mode === 'lost' ? 'Date last seen' : 'Date found'} name="date" type="date" required />
      <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={shareLocation} disabled={locating} onChange={(event) => toggleLocationSharing(event.target.checked)} className="mt-1 accent-emerald-700" />
          <span><strong className="block text-slate-900">Share an approximate map pin (optional)</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{locating ? 'Requesting location permission…' : 'Only share if you choose. Coordinates are reduced to neighborhood-level precision for the rescue map.'}</span></span>
        </label>
        {shareLocation && coordinates && <><input type="hidden" name="latitude" value={coordinates.latitude} /><input type="hidden" name="longitude" value={coordinates.longitude} /><input type="hidden" name="share_location" value="true" /></>}
      </div>
      <label className="sm:col-span-2"><span className="mb-2 block text-sm font-bold text-slate-700">Description</span><textarea name="description" rows={4} placeholder="Distinctive markings, collar, temperament, or other helpful details" className="form-input resize-y" /></label>
      {error && <div className="sm:col-span-2"><ErrorNotice message={error} /></div>}
      <div className="sm:col-span-2 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-xs leading-5 text-slate-500">Your phone and email stay private. Use in-app chat to contact the other report owner.</p>
        <button disabled={busy} type="submit" className="btn-primary disabled:opacity-60"><Upload className="h-4 w-4" />{busy ? 'Processing photo…' : 'Submit report & find matches'}</button>
      </div>
    </form>
  </PageMotion>
}

function Field({ label, name, placeholder, type = 'text', required = false, defaultValue }: { label: string; name: string; placeholder?: string; type?: string; required?: boolean; defaultValue?: string }) {
  return <label><span className="mb-2 block text-sm font-bold text-slate-700">{label}{required && <span className="text-rose-600"> *</span>}</span><input name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} className="form-input" /></label>
}

function AuthPage() {
  const { session, saveSession } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'register'>(searchParams.get('mode') === 'register' ? 'register' : 'login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const payload: Record<string, string> = {
      email: String(form.get('email') || ''),
      password: String(form.get('password') || ''),
    }
    if (mode === 'register') {
      payload.full_name = String(form.get('full_name') || '')
      payload.phone = String(form.get('phone') || '')
    }
    try {
      const response = await apiRequest<{ access_token: string; user: User }>(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(payload) })
      saveSession({ token: response.access_token, user: response.user })
      navigate('/dashboard')
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (session) return <PageMotion className="mx-auto max-w-3xl px-4 py-14 sm:px-6"><EmptyState title={`You’re signed in, ${session.user.full_name.split(' ')[0]}.`} text="Your pet reports and private conversations are ready." action={<Link to="/dashboard" className="btn-primary">Go to dashboard</Link>} /></PageMotion>

  return <PageMotion className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
    <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
      <div className="bg-emerald-950 p-8 text-white sm:p-10">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><PawPrint className="h-6 w-6" /></span>
        <p className="mt-9 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">A community that cares</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Together, we can bring them home.</h1>
        <p className="mt-4 text-sm leading-6 text-emerald-100/80">Create a secure account to manage reports, review real image matches, and message other pet guardians privately.</p>
        <div className="mt-8 space-y-3 text-sm text-emerald-50"><p className="flex items-center gap-2"><Shield className="h-4 w-4" /> Your contact details stay private</p><p className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI results are always labeled as potential matches</p></div>
      </div>
      <div className="p-6 sm:p-10">
        <div className="mb-7 flex rounded-full bg-slate-100 p-1"><button onClick={() => setMode('login')} className={`flex-1 rounded-full py-2.5 text-sm font-bold ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Log in</button><button onClick={() => setMode('register')} className={`flex-1 rounded-full py-2.5 text-sm font-bold ${mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Create account</button></div>
        <h2 className="text-2xl font-black text-slate-900">{mode === 'login' ? 'Welcome back' : 'Join Pet-Finder'}</h2>
        <p className="mt-1 text-sm text-slate-500">{mode === 'login' ? 'Log in to continue to your reports.' : 'Set up your account to report a pet.'}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'register' && <Field label="Full name" name="full_name" required placeholder="Your name" />}
          <Field label="Email address" name="email" type="email" required placeholder="you@example.com" />
          {mode === 'register' && <Field label="Phone (optional)" name="phone" type="tel" placeholder="For account recovery only" />}
          <Field label="Password" name="password" type="password" required placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'} />
          {error && <ErrorNotice message={error} />}
          <button disabled={busy} type="submit" className="btn-primary w-full justify-center disabled:opacity-60">{busy ? 'Please wait…' : mode === 'login' ? 'Log in securely' : 'Create my account'} <ArrowRight className="h-4 w-4" /></button>
        </form>
        <p className="mt-5 text-center text-xs leading-5 text-slate-500">By continuing, you agree to use the platform responsibly and to verify potential matches in person.</p>
      </div>
    </div>
  </PageMotion>
}

function DashboardPage() {
  const { session } = useAuth()
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [mapReports, setMapReports] = useState<Pet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!session) return
    Promise.all([
      apiRequest<DashboardOverview>('/api/dashboard/overview'),
      apiRequest<Conversation[]>('/api/chat/conversations'),
      apiRequest<MapReportsResponse>('/api/geo/pets'),
    ]).then(([dashboard, chatItems, geoResponse]) => {
      setOverview(dashboard)
      setConversations(chatItems)
      setMapReports(geoResponse.pets)
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
  }, [session])
  if (!session) return <PageMotion className="mx-auto max-w-6xl px-4 py-12 sm:px-6"><AuthPrompt title="Your dashboard is private" /></PageMotion>

  const pets = overview?.my_reports || []
  const stats = overview?.stats
  const activity = overview?.activity_by_status || {}
  const maxActivity = Math.max(1, ...Object.values(activity))
  return <PageMotion className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <div className="relative overflow-hidden rounded-[2rem] bg-[#0b211a] p-6 text-white sm:p-9">
      <div className="pointer-events-none absolute -right-10 -top-20 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Mission control · community intelligence</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Welcome back, {session.user.full_name.split(' ')[0]}.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/70">A real-time view of your reports, visual leads, and conversations. Every match is a lead to verify, never an identity claim.</p></div>
        <div className="flex flex-wrap gap-2"><Link to="/report-lost" className="btn-primary"><Plus className="h-4 w-4" /> Lost report</Link><Link to="/report-found" className="btn-secondary"><Plus className="h-4 w-4" /> Found report</Link></div>
      </div>
    </div>
    {error && <div className="mt-6"><ErrorNotice message={error} /></div>}
    {loading ? <Loading text="Loading your dashboard…" /> : <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Community lost reports" value={stats?.total_lost_pets || 0} icon={<Search className="h-5 w-5" />} />
        <StatCard label="Community found reports" value={stats?.total_found_pets || 0} icon={<PawPrint className="h-5 w-5" />} />
        <StatCard label="Your potential matches" value={stats?.potential_ai_matches ?? 0} icon={<Sparkles className="h-5 w-5" />} />
        <StatCard label="Reunited reports" value={stats?.reunited_pets || 0} icon={<Heart className="h-5 w-5" />} />
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Community signal</p><h2 className="mt-1 text-xl font-bold text-slate-900">Report activity</h2></div><CalendarDays className="h-5 w-5 text-emerald-700" /></div>
          <div className="mt-5 space-y-4">{[['Lost reports', activity.lost || 0], ['Found reports', activity.found || 0], ['Reunited', activity.reunited || 0], ['Closed', activity.closed || 0]].map(([label, count]) => <div key={label} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-xs"><span className="text-slate-500">{label}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100"><motion.div initial={{ width: 0 }} animate={{ width: `${Number(count) / maxActivity * 100}%` }} transition={{ duration: 0.6 }} className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-lime-500" /></div><span className="text-right font-bold text-slate-800">{count}</span></div>)}</div>
          <div className="mt-7 border-t border-slate-100 pt-5"><div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">Recent reports</h3><Link to="/find-pets" className="text-xs font-bold text-emerald-800">Browse reports</Link></div>
            {pets.length ? <div className="mt-3 space-y-2">{pets.slice(0, 4).map((pet) => <div key={pet.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3"><PetImage pet={pet} className="h-12 w-12 shrink-0 rounded-xl object-cover" /><div className="min-w-0 flex-1"><Link to={`/pets/${pet.id}`} className="truncate font-bold text-slate-900 hover:text-emerald-800">{pet.pet_name}</Link><p className="truncate text-xs text-slate-500">{pet.status} · {pet.location}</p></div><StatusBadge status={pet.status} /><Link to={`/matches?petId=${encodeURIComponent(pet.id)}&status=${pet.status}`} aria-label={`View matches for ${pet.pet_name}`} className="rounded-xl p-2 text-emerald-800 hover:bg-emerald-50"><Sparkles className="h-4 w-4" /></Link></div>)}</div> : <EmptyState title="No reports yet" text="Create a lost or found report to start receiving real visual matches." action={<Link to="/report-lost" className="btn-primary">Create a report</Link>} />}
          </div>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Location intelligence</p><h2 className="mt-1 text-xl font-bold text-slate-900">Shared report locations</h2></div><MapPinned className="h-5 w-5 text-emerald-700" /></div>
          <div className="mt-4"><LiveMap reports={mapReports} compact /></div>
          <Link to="/map" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-800">Open live rescue map <ArrowRight className="h-4 w-4" /></Link>
        </section>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Visual search</p><h2 className="mt-1 text-xl font-bold text-slate-900">Recent potential matches</h2></div><Link to="/visual-search" className="text-xs font-bold text-emerald-800">Search photos</Link></div>
          {overview?.recent_matches.length ? <div className="mt-4 space-y-3">{overview.recent_matches.map((match) => match.lost_pet && <div key={match.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3"><PetImage pet={match.lost_pet} className="h-14 w-14 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{match.lost_pet.pet_name} ↔ {match.found_pet?.pet_name}</p><p className="text-xs text-slate-500">Potential match · {match.similarity_percentage.toFixed(1)}% visual similarity</p></div><Link to={`/matches?petId=${encodeURIComponent(match.lost_pet_id || '')}&status=Lost`} className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Review</Link></div>)}</div> : <EmptyState title="No match activity yet" text="New reports are compared with opposite-status photographs as they arrive." action={<Link to="/visual-search" className="btn-secondary">Open visual search</Link>} />}
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Secure communication</p><h2 className="mt-1 text-xl font-bold text-slate-900">Recent conversations</h2></div><MessageCircle className="h-5 w-5 text-emerald-700" /></div>
          {conversations.length ? <div className="mt-4 space-y-2">{conversations.slice(0, 4).map((conversation) => {
            const other = conversation.participant_details.find((participant) => participant.id !== session.user.id)
            return <Link key={conversation.id} to={`/chat/${conversation.id}`} className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-emerald-50"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">{other?.full_name?.slice(0, 1) || 'P'}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{other?.full_name || 'Pet guardian'}</span><span className="mt-1 block truncate text-xs text-slate-500">{conversation.last_message?.message || 'Start a secure conversation'}</span></span>{conversation.unread_count > 0 && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white">{conversation.unread_count}</span>}</Link>
          })}</div> : <EmptyState title="No conversations yet" text="Open a potential match to start a private chat with the other report owner." />}
        </section>
      </div>
    </>}
  </PageMotion>
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">{icon}</span><div><p className="text-2xl font-black text-slate-900">{value}</p><p className="text-xs font-medium text-slate-500">{label}</p></div></div>
}

function MatchResultsPage() {
  const { session } = useAuth()
  const [searchParams] = useSearchParams()
  const petId = searchParams.get('petId') || ''
  const status = searchParams.get('status') || 'Lost'
  const [selected, setSelected] = useState<Pet | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!petId) { setError('Choose a report from your dashboard to view its potential matches.'); setLoading(false); return }
    const endpoint = status === 'Found' ? `/api/matches/search-found/${encodeURIComponent(petId)}` : `/api/matches/search/${encodeURIComponent(petId)}`
    apiRequest<Record<string, unknown>>(endpoint).then((response) => {
      if (!active) return
      setSelected((response.lost_pet || response.found_pet) as Pet)
      setMatches(response.matches as Match[])
    }).catch((reason: Error) => { if (active) setError(reason.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [petId, status])

  if (!session) return <PageMotion className="mx-auto max-w-7xl px-4 py-12 sm:px-6"><AuthPrompt title="Sign in to view potential matches" /></PageMotion>
  const selectedIsLost = status === 'Lost'
  return <PageMotion className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">OpenCLIP visual search</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Potential matches</h1><p className="mt-2 text-sm text-slate-600">{selected ? `Image matches for ${selected.pet_name}.` : 'Scores are calculated from the uploaded photographs.'}</p></div>{selected && <Link to={`/pets/${selected.id}`} className="btn-secondary">View your report</Link>}</div>
    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><CircleHelp className="mt-0.5 h-5 w-5 shrink-0" /><p>Similarity is an AI comparison signal, not proof of identity. Check unique markings and verify ownership before arranging a reunion.</p></div>
    {loading ? <Loading text="Comparing real pet photographs…" /> : error ? <div className="mt-6"><ErrorNotice message={error} /></div> : matches.length ? <div className="mt-7 grid gap-5 md:grid-cols-2">
      {matches.map((match) => {
        const candidate = selectedIsLost ? match.found_pet : match.lost_pet
        if (!candidate || !selected) return null
        const lost = selectedIsLost ? selected : candidate
        const found = selectedIsLost ? candidate : selected
        return <MatchCard key={match.id} match={match} candidate={candidate} lost={lost} found={found} currentUserId={session.user.id} />
      })}
    </div> : <EmptyState title="No visual matches found yet" text="There are no opposite-status reports above the visual similarity threshold. New reports will be compared when submitted." action={<Link to="/find-pets" className="btn-secondary">Browse reports</Link>} />}
  </PageMotion>
}

function ImageComparison({ lost, found }: { lost: Pet; found: Pet }) {
  const [position, setPosition] = useState(50)
  return <div className="relative h-64 overflow-hidden bg-slate-100">
    <PetImage pet={lost} className="absolute inset-0 h-full w-full object-cover" />
    <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
      <PetImage pet={found} className="absolute inset-0 h-full w-full object-cover" />
    </div>
    <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)]" style={{ left: `${position}%` }}>
      <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-emerald-800 text-white">↔</span>
    </div>
    <span className="absolute left-3 top-3 rounded-full bg-slate-950/65 px-2.5 py-1 text-[10px] font-bold text-white">LOST REPORT</span>
    <span className="absolute right-3 top-3 rounded-full bg-slate-950/65 px-2.5 py-1 text-[10px] font-bold text-white">FOUND REPORT</span>
    <label className="absolute inset-x-3 bottom-3 rounded-xl border border-white/30 bg-slate-950/60 p-2 text-[10px] font-semibold text-white backdrop-blur-md">
      Compare photos
      <input aria-label="Image comparison slider" type="range" min="0" max="100" value={position} onChange={(event) => setPosition(Number(event.target.value))} className="mt-1 block w-full accent-emerald-400" />
    </label>
  </div>
}

function MatchCard({ match, candidate, lost, found, currentUserId }: { match: Match; candidate: Pet; lost: Pet; found: Pet; currentUserId: string }) {
  const navigate = useNavigate()
  const [explanation, setExplanation] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const canExplain = lost.user_id === currentUserId || found.user_id === currentUserId
  const canChat = canExplain && Boolean(lost.user_id && found.user_id)

  const explain = async () => {
    setBusy(true); setError('')
    try {
      const response = await apiRequest<{ explanation: Record<string, unknown> }>(`/api/ai/explain-match/${encodeURIComponent(lost.id)}/${encodeURIComponent(found.id)}`, { method: 'POST' })
      setExplanation(response.explanation)
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  const startChat = async () => {
    setChatBusy(true); setError('')
    try {
      const response = await apiRequest<{ conversation: Conversation }>('/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({
          recipient_id: candidate.user_id,
          pet_id: candidate.id,
          lost_pet_id: lost.id,
          found_pet_id: found.id,
          match_id: match.id,
        }),
      })
      navigate(`/chat/${response.conversation.id}`)
    } catch (reason) { setError((reason as Error).message) } finally { setChatBusy(false) }
  }

  return <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <ImageComparison lost={lost} found={found} />
    <div className="p-5">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xl font-bold text-slate-900">{candidate.pet_name}</p><p className="mt-1 text-sm text-slate-500">{candidate.pet_type} · {candidate.breed}</p></div><span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">{match.similarity_percentage.toFixed(1)}% visual similarity</span></div>
      <p className="mt-2 text-xs text-slate-500">{match.confidence_badge} · Potential match only</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600"><p><span className="text-slate-400">Colour</span><br />{candidate.colour || 'Not specified'}</p><p><span className="text-slate-400">Location</span><br />{candidate.location}</p><p><span className="text-slate-400">Date reported</span><br />{candidate.date}</p><p><span className="text-slate-400">Date gap</span><br />{match.date_difference_days !== undefined ? `${match.date_difference_days} days` : 'Not available'}</p><p><span className="text-slate-400">Approx. distance</span><br />{match.distance_km !== undefined ? `${match.distance_km.toFixed(1)} km` : 'Not shared'}</p></div>
      {match.matching_characteristics?.length ? <div className="mt-4 rounded-2xl bg-emerald-50 p-3"><p className="text-xs font-bold text-emerald-950">Shared AI-described visible features</p><div className="mt-2 flex flex-wrap gap-1.5">{match.matching_characteristics.map((item) => <span key={`${item.characteristic}-${item.value}`} className="rounded-full bg-white px-2.5 py-1 text-xs text-emerald-900">{item.characteristic}: {item.value}</span>)}</div></div> : null}
      <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{match.disclaimer}</div>
      {explanation && <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm"><p className="font-bold text-violet-950">Gemini visual comparison</p><p className="mt-2 leading-6 text-slate-700">{String(explanation.summary || '')}</p>{Array.isArray(explanation.similarities) && explanation.similarities.length > 0 && <p className="mt-2 text-slate-700"><strong>Similarities:</strong> {explanation.similarities.join(', ')}</p>}{Array.isArray(explanation.differences) && explanation.differences.length > 0 && <p className="mt-2 text-slate-700"><strong>Differences to review:</strong> {explanation.differences.join(', ')}</p>}<p className="mt-2 text-xs text-violet-800">{String(explanation.verification_advice || 'AI-generated visual comparison; not proof of identity.')}</p></div>}
      {error && <div className="mt-3"><ErrorNotice message={error} /></div>}
      <div className="mt-4 flex flex-wrap gap-2">{canExplain && <button onClick={explain} disabled={busy} className="btn-secondary"><Sparkles className="h-4 w-4" />{busy ? 'Comparing photos…' : 'Why this match?'}</button>}{canChat && candidate.user_id !== currentUserId && <button onClick={startChat} disabled={chatBusy} className="btn-primary"><MessageCircle className="h-4 w-4" />{chatBusy ? 'Opening chat…' : 'Message securely'}</button>}<Link to={`/pets/${candidate.id}`} className="inline-flex items-center px-3 text-sm font-bold text-slate-600 hover:text-emerald-800">Details</Link></div>
    </div>
  </article>
}

function PetDetailsPage() {
  const { petId = '' } = useParams()
  const { session } = useAuth()
  const [pet, setPet] = useState<Pet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!petId) return
    apiRequest<Pet>(`/api/pets/${encodeURIComponent(petId)}`).then(setPet).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
  }, [petId])
  if (loading) return <PageMotion className="mx-auto max-w-5xl px-4 py-12"><Loading text="Loading pet report…" /></PageMotion>
  if (error || !pet) return <PageMotion className="mx-auto max-w-5xl px-4 py-12"><ErrorNotice message={error || 'Pet report not found.'} /></PageMotion>
  return <PageMotion className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
    <Link to="/find-pets" className="text-sm font-bold text-emerald-800">← Back to reports</Link>
    <article className="identity-card mt-5 overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white shadow-[0_30px_90px_rgba(13,54,38,0.12)]">
      <div className="grid md:grid-cols-[0.95fr_1.05fr]">
        <div className="relative min-h-[320px] bg-[#0b211a] p-3 sm:p-5">
          <PetImage pet={pet} className="h-full min-h-[320px] w-full rounded-[1.4rem] object-cover md:min-h-[510px]" />
          <span className="absolute left-7 top-7 rounded-full border border-white/30 bg-slate-950/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md">Pet identity card</span>
        </div>
        <div className="p-6 sm:p-9">
          <div className="flex items-center justify-between gap-3"><StatusBadge status={pet.status} /><span className="text-xs font-medium text-slate-500">Reported {pet.date}</span></div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Visual profile · {pet.id.slice(-8)}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{pet.pet_name || 'Pet report'}</h1>
          <p className="mt-2 text-sm text-slate-600">{pet.pet_type} · {pet.breed || 'Breed unknown'} · {pet.colour || 'Colour not specified'}</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[['Last seen / found', pet.location], ['Date reported', pet.date], ['Fur pattern', pet.ai_analysis?.fur_pattern || 'Not analyzed'], ['Visible markings', pet.ai_analysis?.visible_markings || 'Not analyzed']].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>)}
          </div>
          <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">{pet.description || 'No additional description was provided.'}</p>
          {pet.ai_analysis && <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-950"><Sparkles className="h-4 w-4" /> Gemini-generated visual description</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{pet.ai_analysis.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">{[pet.ai_analysis.animal_type, pet.ai_analysis.colours, pet.ai_analysis.fur_pattern, pet.ai_analysis.approximate_breed, pet.ai_analysis.visible_accessories].filter((value): value is string => Boolean(value && value !== 'Not clear')).map((value) => <span key={value} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-900">{value}</span>)}</div>
            <p className="mt-3 text-xs leading-5 text-slate-500">AI-generated visual description, not a verified biological identity. {pet.ai_analysis.confidence_note}</p>
          </div>}
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">A visual match is only a potential lead. Verify unique details and ownership independently before arranging a reunion.</div>
          <div className="mt-6 flex flex-wrap gap-2">
            {session && (pet.status === 'Lost' || pet.status === 'Found') && <Link to={`/matches?petId=${encodeURIComponent(pet.id)}&status=${pet.status}`} className="btn-primary"><ScanSearch className="h-4 w-4" /> View visual matches</Link>}
            {pet.viewer_is_owner && pet.status === 'Lost' && <Link to={`/poster?petId=${encodeURIComponent(pet.id)}`} className="btn-secondary"><ImagePlus className="h-4 w-4" /> Make a poster</Link>}
          </div>
        </div>
      </div>
    </article>
  </PageMotion>
}

function ChatPage() {
  const { session } = useAuth()
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const activeConversation = conversations.find((item) => item.id === conversationId)
  const otherUser = activeConversation?.participant_details.find((participant) => participant.id !== session?.user.id)

  useEffect(() => {
    if (!session) return
    apiRequest<Conversation[]>('/api/chat/conversations').then((items) => {
      setConversations(items)
      if (!conversationId && items[0]) navigate(`/chat/${items[0].id}`, { replace: true })
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
  }, [session, conversationId, navigate])

  useEffect(() => {
    if (!session || !conversationId) { setMessages([]); return }
    apiRequest<{ messages: ChatMessage[] }>(`/api/chat/messages/${encodeURIComponent(conversationId)}`).then((response) => setMessages(response.messages)).catch((reason: Error) => setError(reason.message))
  }, [session, conversationId])

  useEffect(() => {
    if (!session || !conversationId) return
    const socketUrl = `${API_BASE.replace(/^http/, 'ws')}/ws/chat/${encodeURIComponent(conversationId)}?token=${encodeURIComponent(session.token)}`
    const socket = new WebSocket(socketUrl)
    socketRef.current = socket
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as { type?: string; message?: ChatMessage }
      if (data.type === 'new_message' && data.message) setMessages((items) => items.some((item) => item.id === data.message?.id) ? items : [...items, data.message as ChatMessage])
    }
    socket.onerror = () => setError('Live chat connection failed. You can still send messages over the secure API.')
    return () => { socket.close(); socketRef.current = null }
  }, [session, conversationId])

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const message = draft.trim()
    if ((!message && !attachmentFile) || !conversationId) return
    setError('')
    setSending(true)
    try {
      let attachment: string | undefined
      if (attachmentFile) {
        const formData = new FormData()
        formData.append('image', attachmentFile)
        const uploaded = await apiRequest<{ attachment: string }>(`/api/chat/attachments/${encodeURIComponent(conversationId)}`, { method: 'POST', body: formData })
        attachment = uploaded.attachment
      }
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ message, attachment }))
      } else {
        const response = await apiRequest<{ message: ChatMessage }>(`/api/chat/messages/${encodeURIComponent(conversationId)}`, { method: 'POST', body: JSON.stringify({ message, attachment }) })
        setMessages((items) => items.some((item) => item.id === response.message.id) ? items : [...items, response.message])
      }
      setDraft('')
      setAttachmentFile(null)
    } catch (reason) { setError((reason as Error).message) }
    finally { setSending(false) }
  }

  if (!session) return <PageMotion className="mx-auto max-w-6xl px-4 py-12 sm:px-6"><AuthPrompt title="Private chat is for signed-in users" /></PageMotion>
  return <PageMotion className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
    <div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Private connection</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Secure conversations</h1></div><Shield className="h-6 w-6 text-emerald-700" /></div>
    <div className="grid min-h-[620px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm md:grid-cols-[300px_1fr]">
      <aside className="border-b border-slate-200 bg-slate-50 p-3 md:border-b-0 md:border-r"><p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">Your conversations</p>{conversations.map((item) => {
        const person = item.participant_details.find((participant) => participant.id !== session.user.id)
        return <button key={item.id} onClick={() => navigate(`/chat/${item.id}`)} className={`mb-1 flex w-full items-center gap-3 rounded-2xl p-3 text-left ${item.id === conversationId ? 'bg-emerald-100' : 'hover:bg-white'}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white font-bold text-emerald-800">{person?.full_name?.[0] || 'P'}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{person?.full_name || 'Pet guardian'}</span><span className="block truncate text-xs text-slate-500">{item.last_message?.message || item.pet_details?.pet_name || 'Potential match'}</span></span>{item.unread_count > 0 && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-bold text-white">{item.unread_count}</span>}</button>
      })}{!loading && !conversations.length && <p className="p-3 text-sm leading-6 text-slate-500">No chats yet. Start one from a real potential match.</p>}</aside>
      <section className="flex min-h-[500px] flex-col">
        {activeConversation ? <>
          <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800">{otherUser?.full_name?.[0] || 'P'}</span><span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-900">{otherUser?.full_name || 'Pet guardian'}</span><span className="text-xs text-emerald-700">Private chat · {activeConversation.pet_details?.pet_name || 'Potential match'}</span></span><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-800">Participants only</span></header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">{messages.map((message) => <div key={message.id} className={`flex ${message.sender_id === session.user.id ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${message.sender_id === session.user.id ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-700'}`}>{message.attachment && <SecureAttachment attachment={message.attachment} />}{message.message && <p className="whitespace-pre-wrap">{message.message}</p>}<time className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${message.sender_id === session.user.id ? 'text-emerald-100' : 'text-slate-400'}`}>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{message.sender_id === session.user.id && <span>{message.read_status ? '· Read' : '· Sent'}</span>}</time></div></div>)}{!messages.length && <p className="py-12 text-center text-sm text-slate-500">Say hello and verify the pet’s distinctive markings.</p>}</div>
          {error && <div className="px-4"><ErrorNotice message={error} /></div>}
          {attachmentFile && <p className="px-4 pt-3 text-xs text-emerald-800">Attached: {attachmentFile.name}</p>}
          <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-100 p-3 sm:p-4"><input ref={attachmentInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)} /><button type="button" onClick={() => attachmentInputRef.current?.click()} title="Attach an image" className="rounded-full border border-slate-200 p-3 text-slate-600 hover:text-emerald-800"><ImagePlus className="h-4 w-4" /></button><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000} placeholder="Write a private message…" className="form-input flex-1 rounded-full" /><button disabled={sending || (!draft.trim() && !attachmentFile)} className="btn-primary rounded-full px-5 disabled:opacity-50"><Send className="h-4 w-4" /><span className="hidden sm:inline">{sending ? 'Sending…' : 'Send'}</span></button></form>
        </> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><MessageCircle className="h-10 w-10 text-emerald-700" /><h2 className="mt-4 text-lg font-bold text-slate-900">{loading ? 'Loading your chats…' : 'Choose a conversation'}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Conversations are only available to the owner and finder associated with a potential match.</p>{error && <div className="mt-4"><ErrorNotice message={error} /></div>}</div>}
      </section>
    </div>
  </PageMotion>
}

function SecureAttachment({ attachment }: { attachment: string }) {
  const { session } = useAuth()
  const [source, setSource] = useState('')
  useEffect(() => {
    let active = true
    let objectUrl = ''
    if (!session) return
    fetch(`${API_BASE}${attachment}`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then((response) => {
        if (!response.ok) throw new Error('Attachment unavailable.')
        return response.blob()
      })
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setSource(objectUrl)
      })
      .catch(() => setSource(''))
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [attachment, session?.token])
  return source ? <img src={source} alt="Private chat attachment" className="mb-2 max-h-60 rounded-xl object-contain" /> : <p className="mb-1 text-xs opacity-70">Loading private image…</p>
}

type PawMessage = { role: 'user' | 'assistant'; content: string }

function PawAIChat({ compact = false }: { compact?: boolean }) {
  const { session } = useAuth()
  const [messages, setMessages] = useState<PawMessage[]>([])
  const [draft, setDraft] = useState('')
  const [language, setLanguage] = useState<'en' | 'kn' | 'hi'>('en')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const message = draft.trim()
    if (!message || !session) return
    const history = [...messages, { role: 'user' as const, content: message }]
    setMessages(history)
    setDraft('')
    setBusy(true)
    setError('')
    try {
      const response = await apiRequest<{ reply: string; provider: string }>('/api/ai/assistant/chat', { method: 'POST', body: JSON.stringify({ message, language, history: messages }) })
      setMessages((items) => [...items, { role: 'assistant', content: response.reply }])
    } catch (reason) {
      setMessages(messages)
      setDraft(message)
      setError((reason as Error).message)
    } finally { setBusy(false) }
  }
  if (!session) return <AuthPrompt title="Sign in to chat with Paw AI" />
  return <div className={`flex min-h-0 flex-col ${compact ? 'h-[min(70vh,560px)]' : 'min-h-[520px]'}`}>
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><span className="text-xs font-semibold text-slate-500">Gemini-powered · responses may be imperfect</span><select aria-label="Paw AI response language" value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'kn' | 'hi')} className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs"><option value="en">English</option><option value="kn">ಕನ್ನಡ</option><option value="hi">हिन्दी</option></select></div>
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {!messages.length && <div className="max-w-sm rounded-2xl rounded-tl-sm bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">Hi, I’m Paw AI. I can guide you through reporting a pet, explain potential visual matches, and help you use Pet-Finder.</div>}
      {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><p className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-700'}`}>{message.content}</p></div>)}
      {busy && <div className="flex items-center gap-2 text-xs text-slate-500"><span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />Paw AI is thinking…</div>}
    </div>
    {error && <div className="px-3"><ErrorNotice message={error} /></div>}
    <form onSubmit={ask} className="flex gap-2 border-t border-slate-100 p-3"><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Ask Paw AI…" className="form-input min-w-0 flex-1 rounded-full" /><button disabled={busy || !draft.trim()} aria-label="Send message" className="btn-primary rounded-full px-4 disabled:opacity-50"><Send className="h-4 w-4" /></button></form>
  </div>
}

function PawAssistant() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  return <div className="fixed bottom-4 right-4 z-[60] sm:bottom-6 sm:right-6">
    <AnimatePresence>{open && <motion.div initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.96 }} className="mb-3 w-[min(92vw,390px)] overflow-hidden rounded-3xl border border-emerald-900/10 bg-white shadow-[0_24px_70px_rgba(5,35,25,0.25)]"><header className="flex items-center gap-3 bg-[#0b211a] px-4 py-3 text-white"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300"><PawPrint className="h-5 w-5" /></span><span className="flex-1"><strong className="block text-sm">Paw AI</strong><span className="text-[10px] text-emerald-100/70">Your Pet-Finder guide</span></span><button aria-label="Close Paw AI" onClick={() => setOpen(false)} className="rounded-lg p-2 text-white/70 hover:bg-white/10"><X className="h-4 w-4" /></button></header>{session ? <PawAIChat compact /> : <div className="p-5"><p className="text-sm leading-6 text-slate-600">Sign in to ask Paw AI about reports and potential matches.</p><Link to="/auth" onClick={() => setOpen(false)} className="btn-primary mt-4">Sign in</Link></div>}</motion.div>}</AnimatePresence>
    <button onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? 'Close Paw AI' : 'Open Paw AI'} className="ml-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-300/50 bg-emerald-700 text-white shadow-[0_12px_35px_rgba(4,120,87,0.35)] transition hover:-translate-y-1 hover:bg-emerald-800"><PawPrint className="h-6 w-6" /></button>
  </div>
}

function AssistantPage() {
  const { session } = useAuth()
  if (!session) return <PageMotion className="mx-auto max-w-4xl px-4 py-12 sm:px-6"><SectionHeading eyebrow="Paw AI · Google Gemini" title="A helping paw, whenever you need one." /><AuthPrompt title="Sign in to use Paw AI" /></PageMotion>
  return <PageMotion className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
    <SectionHeading eyebrow="Paw AI · Google Gemini" title="A helping paw, whenever you need one." />
    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Ask about reporting, potential visual matches, posters, or platform navigation. Paw AI uses Gemini and does not identify pets or fabricate match results.</p>
    <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><PawAIChat /></div>
    <TranslationTool />
  </PageMotion>
}

function TranslationTool() {
  const [text, setText] = useState('')
  const [translated, setTranslated] = useState('')
  const [targetLanguage, setTargetLanguage] = useState<'kn' | 'hi'>('kn')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const translate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await apiRequest<{ translated_text: string }>('/api/ai/translate', {
        method: 'POST',
        body: JSON.stringify({ text, target_lang: targetLanguage, source_lang: 'en' }),
      })
      setTranslated(response.translated_text)
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  return <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
    <div className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-emerald-700" /><h2 className="text-lg font-bold text-slate-900">Translate a message</h2></div>
    <p className="mt-1 text-xs text-slate-500">Gemini translates the text you provide; review the result before sharing.</p>
    <form onSubmit={translate} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
      <textarea required value={text} onChange={(event) => setText(event.target.value)} maxLength={3000} rows={3} className="form-input resize-y" placeholder="Enter English text to translate" />
      <div className="flex flex-col gap-2"><select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value as 'kn' | 'hi')} className="form-input"><option value="kn">Kannada</option><option value="hi">Hindi</option></select><button disabled={busy || !text.trim()} className="btn-primary disabled:opacity-50">{busy ? 'Translating…' : 'Translate'}</button></div>
    </form>
    {translated && <p className="mt-3 rounded-2xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">{translated}</p>}
    {error && <div className="mt-3"><ErrorNotice message={error} /></div>}
  </section>
}

function LiveMap({ reports, compact = false, center }: { reports: Pet[]; compact?: boolean; center?: { latitude: number; longitude: number } | null }) {
  const mapElement = useRef<HTMLDivElement>(null)
  const [mapError, setMapError] = useState(false)
  const latitude = center?.latitude
  const longitude = center?.longitude
  useEffect(() => {
    const element = mapElement.current
    if (!element) return
    let active = true
    let map: Leaflet.Map | undefined
    let timer = 0
    setMapError(false)
    void import('leaflet').then(({ default: L }) => {
      if (!active) return
      map = L.map(element, { scrollWheelZoom: !compact, zoomControl: !compact })
      const pins = reports.filter((pet) => pet.location_shared && Number.isFinite(pet.latitude) && Number.isFinite(pet.longitude))
      const initial: LatLngTuple = latitude !== undefined && longitude !== undefined
        ? [latitude, longitude]
        : pins.length
          ? [pins[0].latitude!, pins[0].longitude!]
          : [18, 0]
      map.setView(initial, pins.length ? (compact ? 3 : 10) : 2)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)
      const bounds: LatLngTuple[] = []
      for (const pet of pins) {
        const point: LatLngTuple = [pet.latitude!, pet.longitude!]
        const color = pet.status === 'Lost' ? '#e15d50' : '#0b8b68'
        const marker = L.circleMarker(point, {
          radius: compact ? 7 : 9,
          color: '#ffffff',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.95,
        }).addTo(map)
        const popup = document.createElement('div')
        const name = document.createElement('strong')
        name.textContent = pet.pet_name || 'Pet report'
        const details = document.createElement('p')
        details.textContent = `${pet.status} · ${pet.pet_type} · ${pet.location}`
        const link = document.createElement('a')
        link.href = `/pets/${encodeURIComponent(pet.id)}`
        link.textContent = 'View report'
        link.className = 'leaflet-popup-link'
        popup.append(name, details, link)
        marker.bindPopup(popup)
        bounds.push(point)
      }
      if (bounds.length > 1 && latitude === undefined) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 })
      timer = window.setTimeout(() => map?.invalidateSize(), 100)
    }).catch(() => { if (active) setMapError(true) })
    return () => {
      active = false
      window.clearTimeout(timer)
      map?.remove()
    }
  }, [reports, compact, latitude, longitude])
  return <div className="relative"><div ref={mapElement} className={`leaflet-map w-full overflow-hidden rounded-2xl ${compact ? 'h-52 sm:h-60' : 'h-[min(64vh,620px)] min-h-[360px]'}`} aria-label="Map of reports with user-shared approximate locations" />{mapError && <p role="alert" className="absolute inset-3 flex items-center justify-center rounded-xl bg-white/90 p-4 text-center text-sm text-rose-800">The map could not be loaded. Check your connection and try again.</p>}</div>
}

function LiveMapPage() {
  const [reports, setReports] = useState<Pet[]>([])
  const [status, setStatus] = useState('All')
  const [petType, setPetType] = useState('All')
  const [location, setLocation] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [radius, setRadius] = useState('25')
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const query = new URLSearchParams()
    if (center) {
      query.set('lat', String(center.latitude))
      query.set('lng', String(center.longitude))
      query.set('radius_km', radius)
    }
    if (status !== 'All') query.set('status', status)
    if (petType !== 'All') query.set('pet_type', petType)
    if (location.trim()) query.set('location', location.trim())
    if (dateFrom) query.set('date_from', dateFrom)
    if (dateTo) query.set('date_to', dateTo)
    setLoading(true)
    apiRequest<MapReportsResponse>(`/api/geo/pets?${query.toString()}`).then((response) => {
      if (active) setReports(response.pets)
    }).catch((reason: Error) => { if (active) setError(reason.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [center, radius, status, petType, location, dateFrom, dateTo])

  const findNearby = () => {
    setError('')
    if (!navigator.geolocation) { setError('This browser does not support location access.'); return }
    navigator.geolocation.getCurrentPosition(
      (position) => setCenter({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => setError('Location access was not granted. You can still browse all shared map pins.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }
  return <PageMotion className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Location intelligence</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Live rescue map</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Only reports with an explicitly shared approximate pin appear. No map location is inferred from an address.</p></div><button onClick={findNearby} className="btn-primary"><MapPin className="h-4 w-4" /> Find near me</button></div>
    <div className="mt-6 grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
      <label className="lg:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-600">Location text</span><input value={location} onChange={(event) => setLocation(event.target.value)} className="form-input" placeholder="Neighborhood or city" /></label>
      <label><span className="mb-1.5 block text-xs font-bold text-slate-600">Report status</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="form-input"><option>All</option><option>Lost</option><option>Found</option></select></label>
      <label><span className="mb-1.5 block text-xs font-bold text-slate-600">Animal</span><select value={petType} onChange={(event) => setPetType(event.target.value)} className="form-input"><option>All</option><option>Dog</option><option>Cat</option><option>Other</option></select></label>
      <label><span className="mb-1.5 block text-xs font-bold text-slate-600">From date</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="form-input" /></label>
      <label><span className="mb-1.5 block text-xs font-bold text-slate-600">To date</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="form-input" /></label>
      {center && <label className="lg:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-600">Search radius</span><select value={radius} onChange={(event) => setRadius(event.target.value)} className="form-input"><option value="5">5 km</option><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option></select></label>}
    </div>
    {error && <div className="mt-4"><ErrorNotice message={error} /></div>}
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-2"><LiveMap reports={reports} center={center} />{loading && <div className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow">Updating map…</div>}</div>
      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Current filters</p><h2 className="mt-1 text-xl font-bold text-slate-900">{loading ? '…' : reports.length} shared pins</h2></div><div className="flex gap-2 text-[10px] font-bold"><span className="text-rose-700">● Lost</span><span className="text-emerald-700">● Found</span></div></div>
        <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto">        {reports.map((pet) => <Link key={pet.id} to={`/pets/${pet.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50"><PetImage pet={pet} className="h-14 w-14 rounded-xl object-cover" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{pet.pet_name}</strong><span className="block truncate text-xs text-slate-500">{pet.status} · {pet.location}</span></span><StatusBadge status={pet.status} /></Link>)}
          {!loading && !reports.length && <EmptyState title="No shared pins match" text="Try another filter or look for reports without a location pin in the report directory." action={<Link to="/find-pets" className="btn-secondary">Browse reports</Link>} />}
        </div>
        <p className="mt-4 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-500">Map tiles © OpenStreetMap contributors. Pins are rounded to neighborhood-level precision and shown only when the reporter opts in.</p>
      </section>
    </div>
  </PageMotion>
}

type VisualSearchResponse = {
  total_candidates_analyzed: number
  total_matches: number
  matches: Array<{ pet: Pet; similarity_percentage: number; confidence_badge: string; disclaimer: string }>
}

function VisualSearchPage() {
  const { session } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null)
  const [matches, setMatches] = useState<VisualSearchResponse | null>(null)
  const [statusFilter, setStatusFilter] = useState('All')
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    setMatches(null)
    setAnalysis(null)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setError('')
    const data = new FormData()
    data.append('image', file)
    data.append('status_filter', statusFilter)
    try {
      const response = await apiRequest<VisualSearchResponse>('/api/pets/visual-search', { method: 'POST', body: data })
      setMatches(response)
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  const analyze = async () => {
    if (!file) return
    setAnalyzing(true)
    setError('')
    const data = new FormData()
    data.append('image', file)
    try {
      const response = await apiRequest<{ analysis: AIAnalysis }>('/api/ai/analyze-image', { method: 'POST', body: data })
      setAnalysis(response.analysis)
    } catch (reason) { setError((reason as Error).message) } finally { setAnalyzing(false) }
  }
  if (!session) return <PageMotion className="mx-auto max-w-6xl px-4 py-12"><AuthPrompt title="Sign in to use visual search" /></PageMotion>
  return <PageMotion className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
    <div className="rounded-[2rem] bg-[#0b211a] p-6 text-white sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">OpenCLIP visual search</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Search by photograph.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/70">A real image embedding is compared against stored report embeddings with cosine similarity. Search uploads are processed for this request and are not saved as reports.</p></div>
    <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
        <label className="block text-sm font-bold text-slate-800">Choose or drop a clear pet photo</label>
        <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setFile(event.dataTransfer.files[0] || null) }} className="mt-3 flex min-h-64 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 text-center">
          {preview ? <span className="relative block h-full w-full"><img src={preview} alt="Visual search upload preview" className="h-72 w-full object-contain" />{(busy || analyzing) && <span className="image-scan-overlay"><span className="image-scan-bar" /><span className="absolute inset-x-0 bottom-3 text-center text-xs font-bold text-white">{busy ? 'Comparing with real report embeddings…' : 'Gemini is analyzing visible details…'}</span></span>}</span> : <span className="p-8"><Upload className="mx-auto h-8 w-8 text-emerald-700" /><span className="mt-3 block text-sm font-bold">Drop image here or browse</span><span className="mt-1 block text-xs text-slate-500">JPG, PNG, WebP · maximum 10 MB</span></span>}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="form-input"><option value="All">Compare all reports</option><option value="Lost">Lost reports</option><option value="Found">Found reports</option></select><button disabled={!file || busy} className="btn-primary justify-center disabled:opacity-50"><ScanSearch className="h-4 w-4" />{busy ? 'Comparing photos…' : 'Run visual search'}</button></div>
        <button type="button" onClick={analyze} disabled={!file || analyzing} className="btn-secondary mt-3 w-full justify-center disabled:opacity-50"><Sparkles className="h-4 w-4" />{analyzing ? 'Gemini analyzing…' : 'Describe visible features with Gemini'}</button>
        {error && <div className="mt-4"><ErrorNotice message={error} /></div>}
        {analysis && <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-emerald-900">Gemini image analysis</p><p className="mt-2 text-sm leading-6 text-slate-700">{analysis.description}</p><p className="mt-2 text-xs text-slate-500">{analysis.confidence_note}</p></div>}
      </form>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Ranked results</p><h2 className="mt-1 text-xl font-bold text-slate-900">Potential visual matches</h2></div>{matches && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-900">{matches.total_candidates_analyzed} reports checked</span>}</div>
        {matches?.matches.length ? <div className="mt-5 space-y-4">{matches.matches.map((item, index) => <article key={item.pet.id} className="overflow-hidden rounded-2xl border border-slate-200"><div className="grid grid-cols-[7rem_1fr]"><PetImage pet={item.pet} className="h-full min-h-32 w-full object-cover" /><div className="p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-800">#{index + 1} · Potential match</p><Link to={`/pets/${item.pet.id}`} className="mt-1 block font-bold text-slate-900 hover:text-emerald-800">{item.pet.pet_name}</Link><p className="text-xs text-slate-500">{item.pet.status} · {item.pet.pet_type} · {item.pet.location}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-900">{item.similarity_percentage.toFixed(1)}%</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{item.confidence_badge} · {item.disclaimer}</p></div></div></article>)}</div> : matches ? <EmptyState title="No potential matches" text="No stored report exceeded the visual search threshold for this photo." /> : <EmptyState title="Results appear here" text="Upload a photo and run visual search to compare against actual report embeddings." />}
      </section>
    </div>
  </PageMotion>
}

type AppNotification = {
  id: string
  type: string
  title: string
  message: string
  created_at: string
  read_status: boolean
  pet_id?: string
  conversation_id?: string
}

type NotificationPreferences = {
  match_alerts: boolean
  area_alerts: boolean
  message_alerts: boolean
  email_alerts: boolean
  alert_radius_km: number
}

function NotificationsPage() {
  const { session } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const refresh = () => Promise.all([
    apiRequest<{ notifications: AppNotification[] }>('/api/notifications'),
    apiRequest<{ preferences: NotificationPreferences }>('/api/notifications/preferences'),
  ]).then(([notes, prefs]) => { setNotifications(notes.notifications); setPreferences(prefs.preferences) })
  useEffect(() => {
    if (!session) { setLoading(false); return }
    let active = true
    refresh().catch((reason: Error) => { if (active) setError(reason.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session])
  const markRead = async (item: AppNotification) => {
    if (item.read_status) return
    try {
      await apiRequest(`/api/notifications/${encodeURIComponent(item.id)}/read`, { method: 'PUT' })
      setNotifications((items) => items.map((note) => note.id === item.id ? { ...note, read_status: true } : note))
    } catch (reason) { setError((reason as Error).message) }
  }
  const markAllRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'PUT' })
      setNotifications((items) => items.map((note) => ({ ...note, read_status: true })))
    } catch (reason) { setError((reason as Error).message) }
  }
  const savePreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!preferences) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const response = await apiRequest<{ preferences: NotificationPreferences }>('/api/notifications/preferences', { method: 'PUT', body: JSON.stringify(preferences) })
      setPreferences(response.preferences)
      setSaved(true)
    } catch (reason) { setError((reason as Error).message) } finally { setSaving(false) }
  }
  if (!session) return <PageMotion className="mx-auto max-w-6xl px-4 py-12"><AuthPrompt title="Your notifications are private" /></PageMotion>
  return <PageMotion className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Rescue network activity</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Notification centre</h1><p className="mt-2 text-sm text-slate-600">Actual match, nearby-report, message, and reunion events for your account.</p></div><button onClick={markAllRead} className="btn-secondary"><CheckCheck className="h-4 w-4" /> Mark all read</button></div>
    {error && <div className="mt-5"><ErrorNotice message={error} /></div>}
    <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">Recent activity</h2><span className="text-xs text-slate-500">{notifications.filter((note) => !note.read_status).length} unread</span></div>
        {loading ? <Loading text="Loading notifications…" /> : notifications.length ? <div className="mt-4 divide-y divide-slate-100">{notifications.map((item) => <article key={item.id} className={`flex items-start gap-3 py-4 ${item.read_status ? 'opacity-70' : ''}`}><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.read_status ? 'bg-slate-200' : 'bg-emerald-500'}`} /><div className="min-w-0 flex-1"><button onClick={() => void markRead(item)} className="text-left"><strong className="block text-sm text-slate-900">{item.title}</strong><span className="mt-1 block text-sm leading-6 text-slate-600">{item.message}</span><time className="mt-2 block text-[11px] text-slate-400">{new Date(item.created_at).toLocaleString()}</time></button><span className="mt-2 flex gap-3">{item.pet_id && <Link onClick={() => void markRead(item)} to={`/pets/${encodeURIComponent(item.pet_id)}`} className="text-xs font-bold text-emerald-800">View report</Link>}{item.conversation_id && <Link onClick={() => void markRead(item)} to={`/chat/${encodeURIComponent(item.conversation_id)}`} className="text-xs font-bold text-emerald-800">Open chat</Link>}</span></div></article>)}</div> : <EmptyState title="No notifications yet" text="New genuine match and message events will appear here." />}
      </section>
      <form onSubmit={savePreferences} className="h-fit rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Your controls</p><h2 className="mt-1 text-xl font-bold text-slate-900">Notification preferences</h2>
        {preferences ? <div className="mt-4 space-y-3">{[
          ['match_alerts', 'Potential match alerts', 'When a new report matches one of yours.'],
          ['area_alerts', 'Nearby found-pet reports', 'Uses only opt-in approximate map locations.'],
          ['message_alerts', 'New secure messages', 'When another conversation participant writes.'],
        ].map(([key, title, description]) => <label key={key} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3"><input type="checkbox" checked={Boolean(preferences[key as keyof NotificationPreferences])} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} className="mt-1 accent-emerald-700" /><span><strong className="block text-sm text-slate-800">{title}</strong><span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span></span></label>)}
          <label className="block text-sm font-bold text-slate-700">Nearby alert radius<select value={preferences.alert_radius_km} onChange={(event) => setPreferences({ ...preferences, alert_radius_km: Number(event.target.value) })} className="form-input mt-2"><option value={5}>5 km</option><option value={10}>10 km</option><option value={25}>25 km</option><option value={50}>50 km</option></select></label>
          <p className="text-xs leading-5 text-slate-500">Email delivery is not configured; alerts are shown in this signed-in notification centre.</p>
          <button disabled={saving} className="btn-primary w-full justify-center disabled:opacity-50">{saving ? 'Saving…' : 'Save preferences'}</button>
          {saved && <p className="text-xs font-semibold text-emerald-800">Preferences saved.</p>}
        </div> : <Loading text="Loading preferences…" />}
      </form>
    </div>
  </PageMotion>
}

type PosterData = {
  pet_id: string
  headline: string
  pet_name: string
  pet_type: string
  breed: string
  colour: string
  location: string
  date: string
  image: string
  description: string
  reward: string
  contact_method: string
  qr_code_data_url: string
  report_url: string
  disclaimer: string
}

function PosterStudioPage() {
  const { session } = useAuth()
  const [searchParams] = useSearchParams()
  const [pets, setPets] = useState<Pet[]>([])
  const [selectedId, setSelectedId] = useState(searchParams.get('petId') || '')
  const [poster, setPoster] = useState<PosterData | null>(null)
  const [headline, setHeadline] = useState('')
  const [reward, setReward] = useState('')
  const [announcement, setAnnouncement] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!session) { setLoading(false); return }
    apiRequest<Pet[]>('/api/pets/user/my').then((items) => {
      const lost = items.filter((pet) => pet.status === 'Lost')
      setPets(lost)
      if (!lost.some((pet) => pet.id === selectedId)) setSelectedId(lost[0]?.id || '')
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
  }, [session])
  const loadPoster = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (!selectedId) return
    setBusy(true); setError(''); setAnnouncement(null)
    const query = new URLSearchParams()
    if (headline.trim()) query.set('headline', headline.trim())
    if (reward.trim()) query.set('reward', reward.trim())
    try {
      const response = await apiRequest<PosterData>(`/api/posters/${encodeURIComponent(selectedId)}?${query.toString()}`)
      setPoster(response)
      setHeadline(response.headline)
      setReward(response.reward)
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => {
    if (selectedId && !poster && pets.some((pet) => pet.id === selectedId)) void loadPoster()
  }, [selectedId, pets])
  const generateAnnouncement = async () => {
    if (!selectedId) return
    setBusy(true); setError('')
    try {
      const result = await apiRequest<Record<string, string>>('/api/ai/assistant/announcement', { method: 'POST', body: JSON.stringify({ pet_id: selectedId, language: 'en' }) })
      setAnnouncement(result)
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  const createCanvasBlob = async () => {
    if (!poster || !session) throw new Error('Select a lost-pet report first.')
    const response = await fetch(`${API_BASE}${poster.image}`, { headers: { Authorization: `Bearer ${session.token}` } })
    if (!response.ok) throw new Error('Could not load the private pet photograph.')
    const photoUrl = URL.createObjectURL(await response.blob())
    try {
      const photo = new Image()
      photo.src = photoUrl
      await photo.decode()
      const qr = new Image()
      qr.src = poster.qr_code_data_url
      await qr.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 1600
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Poster rendering is unavailable in this browser.')
      context.fillStyle = '#f7f5eb'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#0b211a'
      context.fillRect(0, 0, canvas.width, 22)
      context.textAlign = 'center'
      context.fillStyle = '#0b211a'
      context.font = '800 56px Arial'
      context.fillText(headline || poster.headline, 600, 105, 1080)
      context.font = '700 44px Arial'
      context.fillText(poster.pet_name || 'Missing pet', 600, 168, 1080)
      const box = { x: 50, y: 205, width: 1100, height: 720 }
      const scale = Math.min(box.width / photo.width, box.height / photo.height)
      const width = photo.width * scale
      const height = photo.height * scale
      context.fillStyle = '#e5e7eb'
      context.fillRect(box.x, box.y, box.width, box.height)
      context.drawImage(photo, box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height)
      context.textAlign = 'left'
      context.fillStyle = '#173c2e'
      context.font = '700 30px Arial'
      context.fillText(`${poster.pet_type} · ${poster.breed || 'Breed unknown'} · ${poster.colour || 'Colour not specified'}`, 55, 985, 1090)
      context.font = '600 27px Arial'
      context.fillText(`Last seen: ${poster.location} · ${poster.date}`, 55, 1035, 1090)
      context.font = '24px Arial'
      const lines = (poster.description || 'Please view the report for the available description.').match(/.{1,76}(\s|$)/g) || [poster.description]
      lines.slice(0, 4).forEach((line, index) => context.fillText(line.trim(), 55, 1085 + index * 36, 1090))
      if (reward) {
        context.fillStyle = '#0b211a'
        context.font = '700 30px Arial'
        context.fillText(reward, 55, 1260, 720)
      }
      context.drawImage(qr, 930, 1210, 190, 190)
      context.fillStyle = '#173c2e'
      context.font = 'bold 22px Arial'
      context.fillText('Scan for report', 925, 1435, 210)
      context.font = '20px Arial'
      context.fillText('Contact through Pet-Finder secure chat', 55, 1390, 790)
      context.fillText(poster.disclaimer, 55, 1460, 820)
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Poster image could not be created.')), 'image/png'))
    } finally { URL.revokeObjectURL(photoUrl) }
  }
  const downloadPoster = async () => {
    setError('')
    try {
      const blob = await createCanvasBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${(poster?.pet_name || 'pet-finder-poster').replace(/[^a-z0-9-]/gi, '-')}-poster.png`
      link.click()
      URL.revokeObjectURL(url)
    } catch (reason) { setError((reason as Error).message) }
  }
  const sharePoster = async () => {
    if (!poster) return
    setError('')
    try {
      const blob = await createCanvasBlob()
      const file = new File([blob], 'pet-finder-poster.png', { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: poster.headline, files: [file] })
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(poster.report_url)
        setError('Poster sharing is not available here; the report link was copied instead.')
      } else setError('Sharing is not supported by this browser. Download the poster to share it.')
    } catch (reason) { setError((reason as Error).message) }
  }
  const selectedPet = pets.find((pet) => pet.id === poster?.pet_id)
  if (!session) return <PageMotion className="mx-auto max-w-6xl px-4 py-12"><AuthPrompt title="Poster studio is private to report owners" /></PageMotion>
  return <PageMotion className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
    <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Community outreach</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Missing-pet poster studio</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Create a printable poster from your real report photo, with a QR code linking to that report. The photograph is placed without altering the animal’s appearance.</p></div>
    {loading ? <Loading text="Loading your lost-pet reports…" /> : pets.length ? <div className="mt-6 grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
      <section className="h-fit rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><form onSubmit={loadPoster} className="space-y-4">
        <label className="block text-sm font-bold text-slate-700">Your lost-pet report<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setPoster(null) }} className="form-input mt-2">        {pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.pet_name} · {pet.location}</option>)}</select></label>
        <label className="block text-sm font-bold text-slate-700">Poster headline<input value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={100} className="form-input mt-2" placeholder="MISSING PET" /></label>
        <label className="block text-sm font-bold text-slate-700">Optional reward text<input value={reward} onChange={(event) => setReward(event.target.value)} maxLength={120} className="form-input mt-2" placeholder="Leave blank if no reward is offered" /></label>
        <button disabled={busy} className="btn-primary w-full justify-center">{busy ? 'Preparing poster…' : 'Update poster preview'}</button>
      </form>
      <button disabled={busy} onClick={generateAnnouncement} className="btn-secondary mt-3 w-full justify-center"><Sparkles className="h-4 w-4" />{busy ? 'Gemini drafting…' : 'Generate announcement with Gemini'}</button>
      {announcement && <div className="mt-4 rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-emerald-900">Gemini announcement</p><p className="mt-2 text-sm font-bold text-slate-900">{announcement.headline}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.body}</p><p className="mt-2 text-xs text-emerald-900">{announcement.hashtags}</p></div>}
      {error && <div className="mt-4"><ErrorNotice message={error} /></div>}
      </section>
      {poster && selectedPet && <section className="min-w-0"><div className="printable-poster overflow-hidden rounded-3xl border border-slate-200 bg-[#f7f5eb] p-4 text-center shadow-lg sm:p-7"><div className="rounded-t-2xl bg-[#0b211a] py-4 text-sm font-black uppercase tracking-[0.2em] text-emerald-200">{headline || poster.headline}</div><div className="bg-white p-4"><h2 className="text-3xl font-black text-slate-950">{poster.pet_name}</h2><p className="mt-1 text-sm font-semibold text-slate-600">{poster.pet_type} · {poster.breed} · {poster.colour}</p><PetImage pet={selectedPet} className="mx-auto mt-4 max-h-[28rem] min-h-56 w-full rounded-2xl object-contain" /><p className="mt-4 text-sm font-bold text-slate-800">Last seen: {poster.location} · {poster.date}</p>{poster.description && <p className="mx-auto mt-2 max-w-xl whitespace-pre-wrap text-sm leading-6 text-slate-600">{poster.description}</p>}{reward && <p className="mt-3 font-bold text-emerald-900">{reward}</p>}<div className="mt-5 flex flex-wrap items-center justify-center gap-4 border-t border-slate-100 pt-4"><img src={poster.qr_code_data_url} alt="QR code linking to this Pet-Finder report" className="h-24 w-24" /><span className="max-w-sm text-left text-xs leading-5 text-slate-600">{poster.contact_method}<br /><a href={poster.report_url} className="font-bold text-emerald-800">Open the report</a><br />{poster.disclaimer}</span></div></div></div>
        <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void downloadPoster()} className="btn-primary"><Download className="h-4 w-4" /> Download PNG</button><button onClick={() => window.print()} className="btn-secondary">Print / Save PDF</button><button onClick={() => void sharePoster()} className="btn-secondary">Share poster</button></div>
      </section>}
    </div> : <EmptyState title="No lost-pet reports to turn into a poster" text="Create a lost-pet report first. Poster generation does not create or alter report data." action={<Link to="/report-lost" className="btn-primary">Report a lost pet</Link>} />}
  </PageMotion>
}

type ReunionStory = {
  id: string
  pet_id: string
  pet_name: string
  pet_type: string
  breed?: string
  image: string
  reunion_photo?: string
  owner_name?: string
  finder_name?: string
  location?: string
  story: string
  reunited_at: string
}

function ReunionsPage() {
  const { session } = useAuth()
  const [stories, setStories] = useState<ReunionStory[]>([])
  const [reports, setReports] = useState<Pet[]>([])
  const [petId, setPetId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = () => apiRequest<{ reunions: ReunionStory[] }>('/api/reunions').then((response) => setStories(response.reunions))
  useEffect(() => {
    let active = true
    const tasks: Promise<unknown>[] = [apiRequest<{ reunions: ReunionStory[] }>('/api/reunions').then((result) => { if (active) setStories(result.reunions) })]
    if (session) tasks.push(apiRequest<Pet[]>('/api/pets/user/my').then((items) => {
      if (!active) return
      const eligible = items.filter((pet) => pet.status === 'Lost' || pet.status === 'Found')
      setReports(eligible)
      if (eligible[0]) setPetId(eligible[0].id)
    }))
    Promise.all(tasks).catch((reason: Error) => { if (active) setError(reason.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session])
  const publishStory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true); setError('')
    try {
      await apiRequest('/api/reunions', { method: 'POST', body: JSON.stringify({
        pet_id: petId,
        story: String(data.get('story') || ''),
        reunion_date: String(data.get('reunion_date') || ''),
        finder_name: String(data.get('finder_name') || '') || null,
        location: String(data.get('location') || '') || null,
      }) })
      await load()
      await apiRequest<Pet[]>('/api/pets/user/my').then((items) => setReports(items.filter((pet) => pet.status === 'Lost' || pet.status === 'Found')))
      form.reset()
      setPetId('')
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  return <PageMotion className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
    <div className="relative overflow-hidden rounded-[2rem] bg-[#0b211a] p-7 text-white sm:p-10"><div className="pointer-events-none absolute -right-10 -top-20 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl" /><p className="relative text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Happy reunions</p><h1 className="relative mt-2 text-3xl font-black sm:text-4xl">Real stories. Real homecomings.</h1><p className="relative mt-3 max-w-2xl text-sm leading-6 text-emerald-50/70">Stories below are shared by report owners. A successful reunion is only shown after a user records it.</p></div>
    {error && <div className="mt-5"><ErrorNotice message={error} /></div>}
    {session && reports.length > 0 && <form onSubmit={publishStory} className="mt-6 grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 sm:grid-cols-2 sm:p-7"><div className="sm:col-span-2"><h2 className="text-lg font-bold text-slate-900">Record a reunion</h2><p className="mt-1 text-xs text-slate-500">Only the report owner can publish this story. Exact location is optional; share a broad area only if you choose.</p></div>
      <label className="text-sm font-bold text-slate-700">Your report<select required value={petId} onChange={(event) => setPetId(event.target.value)} className="form-input mt-2"><option value="" disabled>Select a report</option>{reports.map((pet) => <option key={pet.id} value={pet.id}>{pet.pet_name} · {pet.status}</option>)}</select></label>
      <Field label="Reunion date" name="reunion_date" type="date" />
      <Field label="Finder name (optional)" name="finder_name" placeholder="Share only with their permission" />
      <Field label="Broad location (optional)" name="location" placeholder="City or region only" />
      <label className="sm:col-span-2 text-sm font-bold text-slate-700">Your story<textarea name="story" required minLength={10} maxLength={3000} rows={4} className="form-input mt-2" placeholder="Tell the community how you were reunited" /></label>
      <button disabled={busy || !petId} className="btn-primary justify-center sm:col-span-2 disabled:opacity-50">{busy ? 'Publishing…' : 'Publish genuine reunion story'}</button>
    </form>}
    {session && !reports.length && <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">You can record a reunion from this page after you have an open lost- or found-pet report.</div>}
    {loading ? <Loading text="Loading community stories…" /> : stories.length ? <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{stories.map((story) => <motion.article key={story.id} whileHover={{ y: -3 }} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><PetImage pet={{ id: story.pet_id, pet_name: story.pet_name, pet_type: story.pet_type, breed: story.breed || '', colour: '', image: story.reunion_photo || story.image, location: '', date: story.reunited_at, status: 'Reunited', description: '' }} className="h-56 w-full object-cover" /><div className="p-5"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">Reunited · {story.reunited_at}</span><h2 className="mt-3 text-xl font-bold text-slate-900">{story.pet_name}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{story.story}</p><div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">{story.owner_name && <span>Shared by {story.owner_name}</span>}{story.finder_name && <span>· Finder: {story.finder_name}</span>}{story.location && <span>· {story.location}</span>}</div><Link to={`/pets/${story.pet_id}`} className="mt-4 inline-flex text-sm font-bold text-emerald-800">View report <ArrowRight className="ml-1 h-4 w-4" /></Link></div></motion.article>)}</div> : <div className="mt-7"><EmptyState title="No reunion stories yet" text="When a report owner records a genuine reunion, their story will appear here." /></div>}
  </PageMotion>
}

function AdminPage() {
  const { session } = useAuth()
  const [stats, setStats] = useState<Record<string, number> | null>(null)
  const [pets, setPets] = useState<Pet[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  useEffect(() => {
    if (!session || session.user.role !== 'admin') return
    Promise.all([
      apiRequest<Record<string, number>>('/api/admin/dashboard'),
      apiRequest<{ pets: Pet[] }>('/api/admin/pets'),
    ]).then(([dashboard, reports]) => { setStats(dashboard); setPets(reports.pets) }).catch((reason: Error) => setError(reason.message))
  }, [session])
  const closeReport = async (pet: Pet) => {
    setBusyId(pet.id); setError('')
    try {
      await apiRequest(`/api/admin/pets/${encodeURIComponent(pet.id)}/status`, { method: 'PUT', body: JSON.stringify({ status: 'Closed' }) })
      setPets((items) => items.map((item) => item.id === pet.id ? { ...item, status: 'Closed' } : item))
    } catch (reason) { setError((reason as Error).message) } finally { setBusyId('') }
  }
  if (!session) return <PageMotion className="mx-auto max-w-6xl px-4 py-12"><AuthPrompt title="Admin access required" /></PageMotion>
  if (session.user.role !== 'admin') return <PageMotion className="mx-auto max-w-6xl px-4 py-12"><ErrorNotice message="This account does not have administrator access." /></PageMotion>
  return <PageMotion className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <SectionHeading eyebrow="Administration" title="Community overview." />
    {error && <div className="mt-5"><ErrorNotice message={error} /></div>}
    {stats && <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[['Users', stats.total_users], ['Lost reports', stats.total_lost_reports], ['Found reports', stats.total_found_reports], ['Potential matches', stats.potential_ai_matches], ['Reunited', stats.reunited_pets], ['Closed cases', stats.closed_cases]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-2xl font-black text-slate-900">{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></div>)}</div>}
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold text-slate-900">Pet reports</h2><div className="mt-4 divide-y divide-slate-100">{pets.map((pet) => <div key={pet.id} className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-900">{pet.pet_name}</p><p className="text-xs text-slate-500">{pet.status} · {pet.location}</p></div><StatusBadge status={pet.status} />{pet.status !== 'Closed' && pet.status !== 'Reunited' && <button disabled={busyId === pet.id} onClick={() => closeReport(pet)} className="rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-emerald-300">{busyId === pet.id ? 'Updating…' : 'Close case'}</button>}</div>)}</div></section>
  </PageMotion>
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 px-6 py-12 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800"><PawPrint className="h-6 w-6" /></span><h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{text}</p>{action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}</div>
}

function Loading({ text }: { text: string }) {
  return <div className="flex items-center justify-center gap-3 py-14 text-sm font-medium text-slate-500"><span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />{text}</div>
}

function ErrorNotice({ message }: { message: string }) {
  return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">{message}</div>
}

function NotFoundPage() {
  return <PageMotion className="mx-auto max-w-3xl px-4 py-16"><EmptyState title="We couldn’t find that page" text="The link may have changed. Head back to the home page to find your way." action={<Link to="/" className="btn-primary">Back home</Link>} /></PageMotion>
}

export default App
