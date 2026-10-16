export function timeAgo(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso)) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString()
}

export function messageFor(notification) {
  switch (notification.type) {
    case 'reaction':
      return `reacted ${notification.emoji || ''} to your post`.replace('  ', ' ')
    case 'plan_join':
      return 'joined your plan'
    case 'follow':
      return 'started following you'
    case 'plan_invite':
      return 'invited you to a plan'
    case 'comment':
      return 'commented on your post'
    case 'comment_reply':
      return 'replied to your comment'
    default:
      return 'did something'
  }
}

export function destinationFor(notification) {
  const { type, post_id: postId, actor } = notification
  if ((type === 'reaction' || type === 'comment' || type === 'comment_reply') && postId) {
    return `/posts/${postId}`
  }
  if (type === 'plan_join' || type === 'plan_invite') return '/plans'
  if (type === 'follow') return `/u/${actor.username}`
  return null
}
