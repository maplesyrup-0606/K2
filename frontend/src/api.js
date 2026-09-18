const BASE_URL = ''

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      // Let the browser set the Content-Type (with boundary) for multipart
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    // no body
  }
  return { status: res.status, ok: res.ok, data }
}

export const api = {
  baseUrl: BASE_URL,
  loginUrl: `${BASE_URL}/api/auth/google/login`,
  appleLoginUrl: `${BASE_URL}/api/auth/apple/login`,
  // Hides the Apple button until a real Apple Developer integration is
  // configured server-side — set VITE_APPLE_ENABLED=true once ready.
  appleEnabled: import.meta.env.VITE_APPLE_ENABLED === 'true',
  getMe: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  signup: (email, password, displayName) =>
    request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName }),
    }),
  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  verifyEmail: (token) =>
    request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  resendVerification: (email) =>
    request('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  forgotPassword: (email) =>
    request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token, newPassword) =>
    request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    }),
  updateMe: (body) =>
    request('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  updateAvatar: (file) => {
    const fd = new FormData()
    fd.append('photo', file)
    return request('/api/users/me/avatar', { method: 'POST', body: fd })
  },
  createPost: (formData) =>
    request('/api/posts', {
      method: 'POST',
      body: formData,
    }),
  listPosts: (offset = 0, limit = 20, feed = 'all') =>
    request(`/api/posts?offset=${offset}&limit=${limit}&feed=${feed}`),
  getPost: (id) => request(`/api/posts/${id}`),
  deletePost: (id) =>
    request(`/api/posts/${id}`, { method: 'DELETE' }),
  updatePost: (id, body) =>
    request(`/api/posts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  addReaction: (postId, emoji) =>
    request(`/api/posts/${postId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),
  removeReaction: (postId, emoji) =>
    request(`/api/posts/${postId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
    }),
  listComments: (postId) => request(`/api/posts/${postId}/comments`),
  addComment: (postId, body, replyToCommentId = null) =>
    request(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body, reply_to_comment_id: replyToCommentId }),
    }),
  updateComment: (commentId, body) =>
    request(`/api/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),
  deleteComment: (commentId) =>
    request(`/api/comments/${commentId}`, { method: 'DELETE' }),
  searchUsers: (q) =>
    request(`/api/users?q=${encodeURIComponent(q)}`),
  getUserProfile: (username) =>
    request(`/api/users/${username}`),
  followUser: (username) =>
    request(`/api/users/${username}/follow`, { method: 'POST' }),
  unfollowUser: (username) =>
    request(`/api/users/${username}/follow`, { method: 'DELETE' }),
  listFollowing: () => request('/api/users/me/following'),
  listUserPosts: (username, offset = 0, limit = 20) =>
    request(`/api/users/${username}/posts?offset=${offset}&limit=${limit}`),
  getUserStats: (username, window = '30d') =>
    request(`/api/users/${username}/stats?window=${window}`),
  listUserProjects: (username, status = 'active') =>
    request(`/api/users/${username}/projects?status=${status}`),
  getProject: (id) => request(`/api/projects/${id}`),
  createProject: (formData) =>
    request('/api/projects', {
      method: 'POST',
      body: formData,
    }),
  updateProject: (id, body) =>
    request(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteProject: (id) =>
    request(`/api/projects/${id}`, { method: 'DELETE' }),
  listGyms: () => request('/api/gyms'),
  addGym: ({ name, city, country }) =>
    request('/api/admin/gyms', {
      method: 'POST',
      body: JSON.stringify({ name, city, country }),
    }),
  updateGym: (id, { name, city, country }) =>
    request(`/api/admin/gyms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, city, country }),
    }),
  removeGym: (id) =>
    request(`/api/admin/gyms/${id}`, { method: 'DELETE' }),
  listPlans: () => request('/api/plans'),
  createPlan: (body) =>
    request('/api/plans', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  joinPlan: (planId) =>
    request(`/api/plans/${planId}/attendees`, { method: 'POST' }),
  leavePlan: (planId) =>
    request(`/api/plans/${planId}/attendees`, { method: 'DELETE' }),
  updatePlan: (planId, body) =>
    request(`/api/plans/${planId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deletePlan: (planId) =>
    request(`/api/plans/${planId}`, { method: 'DELETE' }),
  listNotifications: () => request('/api/notifications'),
  markNotificationsRead: (ids) =>
    request('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify(ids ? { ids } : {}),
    }),
}
