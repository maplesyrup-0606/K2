import { Link } from 'react-router-dom'
import { api } from '../api'

function statusBadge(project) {
  if (project.is_expired && project.status === 'active') {
    return { text: 'Stale', className: 'bg-stone-200 text-stone-600' }
  }
  if (project.status === 'active') {
    return { text: 'Active', className: 'bg-blue-100 text-blue-700' }
  }
  if (project.status === 'sent') {
    return { text: 'Sent', className: 'bg-emerald-100 text-emerald-700' }
  }
  return { text: 'Abandoned', className: 'bg-stone-100 text-stone-700' }
}

function daysLeft(project) {
  if (project.status !== 'active') return null
  const ms = new Date(project.expires_at) - Date.now()
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24))
  return days
}

export default function ProjectCard({ project }) {
  const badge = statusBadge(project)
  const gradeLabel =
    project.grade_scale === 'v'
      ? `V${project.grade_value}`
      : `Comp ${project.grade_value}`
  const days = daysLeft(project)

  return (
    <Link
      to={`/projects/${project.id}`}
      className="block bg-white border border-stone-200 rounded-2xl overflow-hidden hover:shadow-md transition"
    >
      <div className="aspect-square bg-stone-100">
        <img
          src={`${api.baseUrl}/media/${project.photo_path}`}
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-stone-900 line-clamp-2">
            {project.title}
          </h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
          >
            {badge.text}
          </span>
        </div>
        <div className="mt-1 text-xs text-stone-500">
          {gradeLabel} · {project.sessions} session
          {project.sessions === 1 ? '' : 's'} · {project.attempts_lower_bound}+
          attempts
        </div>
        {days != null && days > 0 && (
          <div className="mt-1 text-[10px] text-stone-400">
            {days} day{days === 1 ? '' : 's'} left
          </div>
        )}
      </div>
    </Link>
  )
}
