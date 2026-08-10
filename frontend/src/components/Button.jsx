const VARIANTS = {
  primary:
    'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg px-4 py-2 font-medium hover:bg-stone-700 dark:hover:bg-stone-300 transition disabled:opacity-50 disabled:cursor-not-allowed',
}

export default function Button({ variant = 'primary', className = '', children, ...props }) {
  return (
    <button className={`${VARIANTS[variant]} ${className}`.trim()} {...props}>
      {children}
    </button>
  )
}
