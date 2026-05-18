import { Link, useLocation } from 'react-router-dom'

function IconHome({ filled }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M3 11L12 3l9 8v10a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V11z" />
    </svg>
  )
}

function IconCalendar({ filled }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
      />
      <path d="M3 10h18M8 2v4M16 2v4" stroke={filled ? 'white' : 'currentColor'} />
    </svg>
  )
}

export default function BottomNav({ currentUser }) {
  const { pathname } = useLocation()

  const isHome = pathname === '/'
  const isPlans = pathname.startsWith('/plans')
  const isProfile = pathname === `/u/${currentUser.username}`

  const itemClass = (active) =>
    `flex-1 flex flex-col items-center justify-center py-2.5 ${
      active ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400 dark:text-stone-500'
    }`

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 flex">
      <Link to="/" className={itemClass(isHome)} aria-label="Feed">
        <IconHome filled={isHome} />
        <span className="text-[10px] mt-0.5">Feed</span>
      </Link>

      <Link to="/plans" className={itemClass(isPlans)} aria-label="Plans">
        <IconCalendar filled={isPlans} />
        <span className="text-[10px] mt-0.5">Plans</span>
      </Link>

      <Link
        to={`/u/${currentUser.username}`}
        className={itemClass(isProfile)}
        aria-label="You"
      >
        {currentUser.avatar_url ? (
          <img
            src={currentUser.avatar_url}
            alt=""
            className={`w-6 h-6 rounded-full ${
              isProfile ? 'ring-2 ring-stone-900' : ''
            }`}
          />
        ) : (
          <div
            className={`w-6 h-6 rounded-full bg-stone-300 dark:bg-stone-600 ${
              isProfile ? 'ring-2 ring-stone-900' : ''
            }`}
          />
        )}
        <span className="text-[10px] mt-0.5">You</span>
      </Link>
    </nav>
  )
}
