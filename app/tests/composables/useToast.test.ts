import { afterEach, describe, expect, it } from 'vite-plus/test'
import { useToast } from '~/composables/useToast'

describe('useToast', () => {
  const toast = useToast()

  afterEach(() => {
    for (const t of [...toast.toasts.value]) toast.removeToast(t.id)
  })

  it('adds toasts of every type with the default durations', () => {
    toast.info('Info', 'details')
    toast.success('Done')
    toast.warning('Careful', undefined, 1000)
    toast.error('Failed')

    expect(
      toast.toasts.value.map(({ type, title, message, duration }) => ({ duration, message, title, type }))
    ).toEqual([
      { duration: 5000, message: 'details', title: 'Info', type: 'info' },
      { duration: 5000, message: undefined, title: 'Done', type: 'success' },
      { duration: 1000, message: undefined, title: 'Careful', type: 'warning' },
      // Errors stay longer by default
      { duration: 8000, message: undefined, title: 'Failed', type: 'error' }
    ])
  })

  it('gives every toast a unique id and shares state between callers', () => {
    toast.info('a')
    useToast().info('b')
    const ids = toast.toasts.value.map((t) => t.id)
    expect(new Set(ids).size).toBe(2)
    expect(useToast().toasts.value).toHaveLength(2)
  })

  it('removes a toast by id and ignores unknown ids', () => {
    toast.error('keep', 'm', 100)
    toast.info('drop')
    const drop = toast.toasts.value.find((t) => t.title === 'drop')
    expect(drop).toBeDefined()
    toast.removeToast(drop?.id ?? -1)
    toast.removeToast(123456)
    expect(toast.toasts.value.map((t) => t.title)).toEqual(['keep'])
    expect(toast.toasts.value[0]?.duration).toBe(100)
  })
})
