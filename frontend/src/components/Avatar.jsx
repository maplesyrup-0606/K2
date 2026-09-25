// Profile photo, or the first letter of the display name on a neutral disc
// when there isn't one. `user` is any payload with avatar_url + display_name.
export default function Avatar({ user, className = 'w-10 h-10' }) {
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt=""
        className={`${className} rounded-full shrink-0 object-cover`}
      />
    )
  }
  return (
    <div
      className={`${className} rounded-full shrink-0 bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-stone-500 dark:text-stone-400 font-medium`}
    >
      {user.display_name?.[0]?.toUpperCase() || '?'}
    </div>
  )
}
