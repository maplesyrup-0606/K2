export default function FormField({
  label,
  hint,
  prefix,
  textarea = false,
  className = '',
  inputClassName = '',
  ...inputProps
}) {
  const fieldClasses = `flex-1 bg-transparent text-sm text-stone-900 dark:text-stone-100 focus:outline-none ${inputClassName}`

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
          {label}
        </label>
      )}
      <div className="flex items-center rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 focus-within:ring-2 focus-within:ring-violet-500">
        {prefix && <span className="text-stone-400 dark:text-stone-500 text-sm mr-0.5 shrink-0">{prefix}</span>}
        {textarea ? (
          <textarea className={fieldClasses} {...inputProps} />
        ) : (
          <input className={fieldClasses} {...inputProps} />
        )}
      </div>
      {hint && <div className="text-xs text-stone-400 dark:text-stone-500 mt-1">{hint}</div>}
    </div>
  )
}
