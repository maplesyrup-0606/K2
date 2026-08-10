export default function Label({ children, suffix, ...props }) {
  return (
    <label className="block text-sm font-medium text-stone-700 dark:text-stone-300" {...props}>
      {children}
      {suffix && <span className="text-stone-400 dark:text-stone-500"> {suffix}</span>}
    </label>
  )
}
