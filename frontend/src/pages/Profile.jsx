import { useEffect, useState, useRef } from 'react'
import { Link, useParams, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import StatsPanel from '../components/StatsPanel'
import { SessionTile } from '../components/SessionCards'
import PhotoWall from '../components/PhotoWall'
import FormField from '../components/FormField'
import { useAsyncEffect } from '../lib/useAsyncEffect'
import PageShell from '../components/PageShell'
import PageHeader from '../components/PageHeader'
import FollowListModal from '../components/FollowListModal'
import {
  isPushSupported,
  isStandalone,
  isIOS,
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/push'

const BIO_MAX_LEN = 160
const POSTS_PAGE_SIZE = 30
const PROFILE_TABS = [
  ['sessions', 'Sessions'],
  ['progress', 'Progress'],
  ['all', 'All'],
]

function InstagramIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export default function Profile({ currentUser, onCurrentUserChange, onLogout }) {
  const { username } = useParams()
  const navigate = useNavigate()
  // Edit profile state
  const [editOpen, setEditOpen] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editInstagram, setEditInstagram] = useState('')
  const [editError, setEditError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const avatarInputRef = useRef(null)

  async function logout() {
    await api.logout()
    if (onLogout) await onLogout()
    navigate('/login')
  }
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  // The tab lives in the URL so coming back from a session lands on the same tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = PROFILE_TABS.some(([key]) => key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'sessions'
  const [sessions, setSessions] = useState([])
  const [sessionTotal, setSessionTotal] = useState(0)
  const [sessionsNextOffset, setSessionsNextOffset] = useState(null)
  const [loadingMoreSessions, setLoadingMoreSessions] = useState(false)
  // null until the All tab is first opened — thumbnails are only fetched on demand.
  const [allPosts, setAllPosts] = useState(null)
  const [postsNextOffset, setPostsNextOffset] = useState(null)
  const [loadingMorePosts, setLoadingMorePosts] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)

  // Push subscription state belongs to this browser/device, not to whichever
  // profile is being viewed — only load/offer it on the signed-in user's own
  // profile page.
  useEffect(() => {
    if (!currentUser || !profile || currentUser.id !== profile.id) return
    if (!isPushSupported()) return
    let cancelled = false
    getPushSubscriptionState().then((enabled) => {
      if (!cancelled) setPushEnabled(enabled)
    })
    return () => { cancelled = true }
  }, [currentUser, profile])

  async function handlePushToggle() {
    if (pushBusy) return
    setPushBusy(true)
    const success = pushEnabled ? await unsubscribeFromPush() : await subscribeToPush()
    if (success) setPushEnabled(!pushEnabled)
    setPushBusy(false)
  }

  useAsyncEffect(async () => {
    setLoading(true)
    setNotFound(false)
    setAllPosts(null)
    setPostsNextOffset(null)
    const [
      { ok: profileOk, data: profileData },
      { ok: sessionsOk, data: sessionsData },
    ] = await Promise.all([
      api.getUserProfile(username),
      api.listUserSessions(username),
    ])
    setLoading(false)
    if (!profileOk || !sessionsOk) {
      setNotFound(true)
      return
    }
    setProfile(profileData)
    setSessions(sessionsData.sessions)
    setSessionTotal(sessionsData.total)
    setSessionsNextOffset(sessionsData.next_offset)
  }, [username])

  useEffect(() => {
    if (tab !== 'all' || allPosts !== null) return
    let cancelled = false
    api.listUserPosts(username, 0, POSTS_PAGE_SIZE).then(({ ok, data }) => {
      if (cancelled) return
      setAllPosts(ok ? data.posts : [])
      setPostsNextOffset(ok ? data.next_offset : null)
    })
    return () => {
      cancelled = true
    }
  }, [tab, allPosts, username])

  function openEdit() {
    setEditDisplayName(currentUser.display_name)
    setEditUsername(currentUser.username)
    setEditBio(currentUser.bio || '')
    setEditInstagram(currentUser.instagram_handle || '')
    setEditError(null)
    setAvatarPreview(null)
    setAvatarFile(null)
    setEditOpen(true)
  }

  function onAvatarPick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function saveProfile() {
    if (saving) return
    setEditError(null)
    setSaving(true)

    if (avatarFile) {
      const { ok, data } = await api.updateAvatar(avatarFile)
      if (!ok) {
        setEditError(data?.error || 'Failed to upload avatar')
        setSaving(false)
        return
      }
      if (onCurrentUserChange) onCurrentUserChange(data)
      setProfile((prev) => (prev ? { ...prev, ...data } : prev))
    }

    const usernameChanged = editUsername.trim().toLowerCase() !== currentUser.username
    const { ok, data } = await api.updateMe({
      display_name: editDisplayName.trim(),
      username: editUsername.trim().toLowerCase(),
      bio: editBio.trim(),
      instagram_handle: editInstagram.trim(),
    })
    if (!ok) {
      setEditError(data?.error || 'Failed to save profile')
      setSaving(false)
      return
    }
    if (onCurrentUserChange) onCurrentUserChange(data)
    setProfile((prev) => (prev ? { ...prev, ...data } : prev))
    if (usernameChanged) {
      setSaving(false)
      setEditOpen(false)
      navigate(`/u/${data.username}`, { replace: true })
      return
    }

    setSaving(false)
    setEditOpen(false)
  }

  const [followBusy, setFollowBusy] = useState(false)
  // 'followers' | 'following' | null — which list sheet is open
  const [followList, setFollowList] = useState(null)

  async function toggleFollow() {
    if (followBusy || !profile) return
    setFollowBusy(true)
    const call = profile.is_following ? api.unfollowUser : api.followUser
    const { ok, data } = await call(profile.username)
    setFollowBusy(false)
    if (!ok) return
    setProfile((prev) => ({ ...prev, ...data }))
  }

  function selectTab(key) {
    setSearchParams(key === 'sessions' ? {} : { tab: key }, { replace: true })
  }

  async function loadMoreSessions() {
    if (sessionsNextOffset == null || loadingMoreSessions) return
    setLoadingMoreSessions(true)
    const { ok, data } = await api.listUserSessions(username, sessionsNextOffset)
    setLoadingMoreSessions(false)
    if (!ok) return
    setSessions((prev) => [...prev, ...data.sessions])
    setSessionsNextOffset(data.next_offset)
  }

  async function loadMorePosts() {
    if (postsNextOffset == null || loadingMorePosts) return
    setLoadingMorePosts(true)
    const { ok, data } = await api.listUserPosts(username, postsNextOffset, POSTS_PAGE_SIZE)
    setLoadingMorePosts(false)
    if (!ok) return
    setAllPosts((prev) => [...prev, ...data.posts])
    setPostsNextOffset(data.next_offset)
  }

  if (notFound) return <Navigate to="/" replace />

  const isOwnProfile = currentUser && profile && currentUser.id === profile.id

  return (
    <PageShell
      header={
        <PageHeader title={isOwnProfile ? 'My profile' : `@${username}`} />
      }
    >
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 sm:pb-6">
        {loading ? (
          <div className="text-center text-stone-400 dark:text-stone-500 py-12">Loading…</div>
        ) : profile ? (
          <>
            {/* Customize profile prompt for users who haven't set it yet */}
            {isOwnProfile && !currentUser.profile_customized && (
              <div className="mb-3 bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-violet-900 dark:text-violet-100">Customize your profile</div>
                  <div className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">Your username was auto-generated — set your name and photo.</div>
                </div>
                <button
                  type="button"
                  onClick={openEdit}
                  className="shrink-0 text-sm font-medium px-3 py-1.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition"
                >
                  Edit
                </button>
              </div>
            )}

            {/* Profile header */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 flex items-center gap-4">
              {profile.avatar_url && (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover"
                />
              )}
              <div className="flex-1">
                <h1 className="text-xl font-semibold">{profile.display_name}</h1>
                <div className="text-sm text-stone-400 dark:text-stone-500">@{profile.username}</div>
                {profile.bio && (
                  <p className="text-sm text-stone-600 dark:text-stone-300 mt-1.5 leading-snug">{profile.bio}</p>
                )}
                {profile.instagram_handle && (
                  <a
                    href={`https://instagram.com/${profile.instagram_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 hover:text-violet-600 dark:hover:text-violet-400 transition"
                  >
                    <InstagramIcon className="w-3.5 h-3.5" />
                    @{profile.instagram_handle}
                  </a>
                )}
                <div className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                  Joined {new Date(profile.created_at).toLocaleDateString()}
                </div>
                <div className="text-xs text-stone-500 dark:text-stone-400 mt-1 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFollowList('followers')}
                    className="hover:text-violet-600 dark:hover:text-violet-400 hover:underline transition py-1"
                  >
                    <span className="font-medium text-stone-700 dark:text-stone-300">{profile.follower_count}</span>{' '}
                    {profile.follower_count === 1 ? 'follower' : 'followers'}
                  </button>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setFollowList('following')}
                    className="hover:text-violet-600 dark:hover:text-violet-400 hover:underline transition py-1"
                  >
                    <span className="font-medium text-stone-700 dark:text-stone-300">{profile.following_count}</span>{' '}
                    following
                  </button>
                </div>
              </div>
              {isOwnProfile ? (
                <button
                  type="button"
                  onClick={openEdit}
                  className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 px-2 py-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                >
                  Edit
                </button>
              ) : (
                <button
                  type="button"
                  onClick={toggleFollow}
                  disabled={followBusy}
                  className={`text-sm font-medium px-4 py-1.5 rounded-xl transition disabled:opacity-50 ${
                    profile.is_following
                      ? 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                      : 'bg-violet-600 text-white hover:bg-violet-700'
                  }`}
                >
                  {profile.is_following ? 'Following' : 'Follow'}
                </button>
              )}
            </div>

            {/* Own profile actions */}
            {isOwnProfile && (
              <div className="mt-3 flex gap-2 sm:hidden">
                {currentUser.is_admin && (
                  <Link
                    to="/admin/invites"
                    className="flex-1 text-center text-sm py-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium"
                  >
                    Admin
                  </Link>
                )}
                <button
                  onClick={logout}
                  className="flex-1 text-sm py-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 font-medium"
                >
                  Log out
                </button>
              </div>
            )}

            {/* Notifications */}
            {isOwnProfile && (isPushSupported() || (isIOS() && !isStandalone())) && (
              <div className="mt-3 flex items-center justify-between gap-3 px-1">
                {isIOS() && !isStandalone() ? (
                  <p className="text-xs text-stone-400 dark:text-stone-500">
                    Install K2 to your home screen to enable notifications.{' '}
                    <Link to="/install" className="text-violet-600 dark:text-violet-400 hover:underline">
                      How to install
                    </Link>
                  </p>
                ) : (
                  <>
                    <span className="text-sm text-stone-700 dark:text-stone-300">Push notifications</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pushEnabled}
                      aria-label="Push notifications"
                      onClick={handlePushToggle}
                      disabled={pushBusy}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                        pushEnabled ? 'bg-violet-600' : 'bg-stone-300 dark:bg-stone-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          pushEnabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Tabs */}
            <div role="tablist" aria-label="Profile sections" className="mt-6 flex border-b border-stone-200 dark:border-stone-800">
              {PROFILE_TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`profile-tab-${key}`}
                  aria-selected={tab === key}
                  aria-controls="profile-tabpanel"
                  onClick={() => selectTab(key)}
                  className={`-mb-px flex-1 border-b-2 py-3 text-sm font-medium transition ${
                    tab === key
                      ? 'border-stone-900 text-stone-900 dark:border-stone-100 dark:text-stone-100'
                      : 'border-transparent text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              role="tabpanel"
              id="profile-tabpanel"
              aria-labelledby={`profile-tab-${tab}`}
              className="mt-4"
            >
              {tab === 'sessions' && (
                <>
                  <div className="mb-3 flex items-baseline justify-between px-1">
                    <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">One tile. One session.</h2>
                    <span className="text-xs text-stone-400 dark:text-stone-500">
                      {sessionTotal} {sessionTotal === 1 ? 'session' : 'sessions'}
                    </span>
                  </div>
                  {sessions.length === 0 ? (
                    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 text-center text-stone-500 dark:text-stone-400 text-sm">
                      {isOwnProfile ? 'No sessions yet. Tap + to log your first climb.' : 'No sessions yet.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {sessions.map((session) => (
                        <SessionTile key={session.date} session={session} />
                      ))}
                    </div>
                  )}
                  {sessionsNextOffset != null && (
                    <div className="pt-4 text-center">
                      <button
                        type="button"
                        onClick={loadMoreSessions}
                        disabled={loadingMoreSessions}
                        className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-50"
                      >
                        {loadingMoreSessions ? 'Loading…' : 'Load more'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {tab === 'progress' && <StatsPanel username={profile.username} />}

              {tab === 'all' && (
                <>
                  {allPosts === null ? (
                    <div className="py-8 text-center text-sm text-stone-400 dark:text-stone-500">Loading…</div>
                  ) : allPosts.length === 0 ? (
                    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 text-center text-stone-500 dark:text-stone-400 text-sm">
                      No climbs yet.
                    </div>
                  ) : (
                    <PhotoWall posts={allPosts} />
                  )}
                  {postsNextOffset != null && (
                    <div className="pt-4 text-center">
                      <button
                        type="button"
                        onClick={loadMorePosts}
                        disabled={loadingMorePosts}
                        className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-50"
                      >
                        {loadingMorePosts ? 'Loading…' : 'Load more'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : null}
      </main>

      {/* Edit profile sheet */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditOpen(false)} />
          <div className="relative bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 space-y-5 shadow-xl">
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Edit profile</h2>

            {/* Avatar picker */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="relative group shrink-0"
              >
                <img
                  src={avatarPreview || currentUser.avatar_url || ''}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover bg-stone-200 dark:bg-stone-700"
                />
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                  <span className="text-white text-xs font-medium">Change</span>
                </div>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onAvatarPick}
              />
              <div className="text-xs text-stone-400 dark:text-stone-500">Tap photo to change. JPEG, PNG, or WebP.</div>
            </div>

            <FormField
              label="Display name"
              type="text"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              maxLength={120}
            />

            <FormField
              label="Username"
              type="text"
              prefix="@"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              maxLength={30}
              hint="3–30 chars, lowercase letters, numbers, underscores"
            />

            <FormField
              label="Bio"
              textarea
              rows={2}
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              maxLength={BIO_MAX_LEN}
              placeholder="A short line about you"
              hint={`${editBio.length}/${BIO_MAX_LEN}`}
            />

            <FormField
              label="Instagram"
              type="text"
              prefix="@"
              value={editInstagram}
              onChange={(e) => setEditInstagram(e.target.value)}
              maxLength={30}
              placeholder="yourhandle"
              hint="Just the handle — no need for a full link"
            />

            {editError && (
              <div className="text-sm text-red-500 dark:text-red-400">{editError}</div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveProfile}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {followList && profile && (
        <FollowListModal
          key={`${profile.username}-${followList}`}
          username={profile.username}
          kind={followList}
          onClose={() => setFollowList(null)}
        />
      )}
    </PageShell>
  )
}
