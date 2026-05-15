const BASE_URL = 'http://localhost:8000'

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
  createPost: (formData) =>
    request('/api/posts', {
      method: 'POST',
      body: formData,
    }),
  listPosts: (offset = 0, limit = 20) =>
    request(`/api/posts?offset=${offset}&limit=${limit}`),
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
  getUserProfile: (username) =>
    request(`/api/users/${username}`),
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
}
