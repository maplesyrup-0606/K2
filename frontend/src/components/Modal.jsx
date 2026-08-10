export default function Modal({
  as: Container = 'div',
  maxWidth = 'max-w-md',
  dvh = false,
  overscrollContain = false,
  children,
  ...containerProps
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4">
      <Container
        className={`bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl ${maxWidth} w-full p-6 ${
          dvh ? 'max-h-[100dvh]' : 'max-h-[100vh]'
        } sm:max-h-[90vh] overflow-y-auto${overscrollContain ? ' overscroll-contain' : ''} shadow-xl`}
        {...containerProps}
      >
        {children}
      </Container>
    </div>
  )
}
