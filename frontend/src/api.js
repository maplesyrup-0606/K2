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
  getMe: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
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
  listPosts: (offset = 0, limit = 20) =>
    request(`/api/posts?offset=${offset}&limit=${limit}`),
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
  listInvites: () => request('/api/admin/invites'),
  addInvite: (email) =>
    request('/api/admin/invites', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  removeInvite: (email) =>
    request(`/api/admin/invites/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    }),
  listNotifications: () => request('/api/notifications'),
  markNotificationsRead: (ids) =>
    request('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify(ids ? { ids } : {}),
    }),
}
