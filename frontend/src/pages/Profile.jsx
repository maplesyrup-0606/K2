import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useParams, Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api'
import PostCard from '../components/PostCard'
import StatsPanel from '../components/StatsPanel'
import ProjectCard from '../components/ProjectCard'
import Composer from './Composer'

export default function Profile({ currentUser, onCurrentUserChange, onLogout }) {
  const { username } = useParams()
  const navigate = useNavigate()
  // Edit profile state
  const [editOpen, setEditOpen] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editUsername, setEditUsername] = useState('')
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
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [nextOffset, setNextOffset] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editing, setEditing] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectStatus, setProjectStatus] = useState('active')
  const [loadingProjects, setLoadingProjects] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setNotFound(false)
    const [
      { ok: ok1, data: profileData },
      { ok: ok2, data: postsData },
    ] = await Promise.all([
      api.getUserProfile(username),
      api.listUserPosts(username),
    ])
    setLoading(false)
    if (!ok1 || !ok2) {
      setNotFound(true)
      return
    }
    setProfile(profileData)
    setPosts(postsData.posts)
    setNextOffset(postsData.next_offset)
  }, [username])

  useEffect(() => {
    load()
  }, [load])

  // Fetch projects whenever username or selected status changes
  useEffect(() => {
    let cancelled = false
    setLoadingProjects(true)
    api.listUserProjects(username, projectStatus).then(({ ok, data }) => {
      if (cancelled) return
      setProjects(ok ? data.projects : [])
      setLoadingProjects(false)
    })
    return () => {
      cancelled = true
    }
  }, [username, projectStatus])

  function openEdit() {
    setEditDisplayName(currentUser.display_name)
    setEditUsername(currentUser.username)
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
    }

    const nameChanged = editDisplayName.trim() !== currentUser.display_name
    const usernameChanged = editUsername.trim().toLowerCase() !== currentUser.username
    if (nameChanged || usernameChanged) {
      const { ok, data } = await api.updateMe({
        display_name: editDisplayName.trim(),
        username: editUsername.trim().toLowerCase(),
      })
      if (!ok) {
        setEditError(data?.error || 'Failed to save profile')
        setSaving(false)
        return
      }
      if (onCurrentUserChange) onCurrentUserChange(data)
      if (usernameChanged) {
        setSaving(false)
        setEditOpen(false)
        navigate(`/u/${data.username}`, { replace: true })
        return
      }
    }

    setSaving(false)
    setEditOpen(false)
  }

  const [followBusy, setFollowBusy] = useState(false)

  async function toggleFollow() {
    if (followBusy || !profile) return
    setFollowBusy(true)
    const call = profile.is_following ? api.unfollowUser : api.followUser
    const { ok, data } = await call(profile.username)
    setFollowBusy(false)
    if (!ok) return
    setProfile((prev) => ({ ...prev, ...data }))
  }

  async function loadMore() {
    if (nextOffset == null || loadingMore) return
    setLoadingMore(true)
    const { ok, data } = await api.listUserPosts(username, nextOffset)
    setLoadingMore(false)
    if (!ok) return
    setPosts((prev) => [...prev, ...data.posts])
    setNextOffset(data.next_offset)
  }

  async function handleDelete(postId) {
    const { ok, data } = await api.deletePost(postId)
    if (!ok) {
      window.alert(data?.error || 'Failed to delete')
      return
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }

  function handleEdit(post) {
    setEditing(post)
  }

  function handleUpdated(updatedPost) {
    setPosts((prev) =>
      prev.map((p) => (p.id === updatedPost.id ? updatedPost : p))
    )
  }

  if (notFound) return <Navigate to="/" replace />

  const isOwnProfile = currentUser && profile && currentUser.id === profile.id

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            K2
          </Link>
          <Link
            to="/"
            className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
          >
            ← Feed
          </Link>
        </div>
      </header>

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
                <div className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                  Joined {new Date(profile.created_at).toLocaleDateString()}
                </div>
                <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  <span className="font-medium text-stone-700 dark:text-stone-300">{profile.follower_count}</span>{' '}
                  {profile.follower_count === 1 ? 'follower' : 'followers'}
                  {' · '}
                  <span className="font-medium text-stone-700 dark:text-stone-300">{profile.following_count}</span>{' '}
                  following
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

            {/* Stats */}
            <div className="mt-6">
              <StatsPanel username={profile.username} />
            </div>

            {/* Projects */}
            <div className="mt-6">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  Projects
                </h2>
                <div className="flex gap-1">
                  {[
                    ['active', 'Active'],
                    ['sent', 'Sent'],
                    ['abandoned', 'Abandoned'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setProjectStatus(key)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                        projectStatus === key
                          ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 dark:hover:bg-stone-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {loadingProjects ? (
                <div className="text-xs text-stone-400 dark:text-stone-500 text-center py-4">
                  Loading…
                </div>
              ) : projects.length === 0 ? (
                <div className="text-xs text-stone-400 dark:text-stone-500 text-center py-4">
                  No {projectStatus} projects.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {projects.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              )}
            </div>

            {/* Post list */}
            <div className="mt-6 space-y-6">
              {posts.length === 0 ? (
                <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 text-center text-stone-500 dark:text-stone-400 text-sm">
                  No posts yet.
                </div>
              ) : (
                posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    currentUserId={currentUser?.id}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onReactionChange={handleUpdated}
                    showActions={isOwnProfile}
                  />
                ))
              )}

              {nextOffset != null && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>

      {editing && (
        <Composer
          post={editing}
          onClose={() => setEditing(null)}
          onUpdated={handleUpdated}
        />
      )}

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

            {/* Display name */}
            <div>
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">Display name</label>
              <input
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                maxLength={120}
                className="w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">Username</label>
              <div className="flex items-center rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 focus-within:ring-2 focus-within:ring-violet-500">
                <span className="text-stone-400 dark:text-stone-500 text-sm mr-0.5">@</span>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  maxLength={30}
                  className="flex-1 bg-transparent text-sm text-stone-900 dark:text-stone-100 focus:outline-none"
                />
              </div>
              <div className="text-xs text-stone-400 dark:text-stone-500 mt-1">3–30 chars, lowercase letters, numbers, underscores</div>
            </div>

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
    </div>
  )
}
