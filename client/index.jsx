import { Settings } from './Settings.jsx'
import { ComposerReview, ReviewIcon, TurnReview } from './Conversation.jsx'
import { prepareFollowup } from './report.js'
import styles from './styles.css'

export const inject = ['slots', 'sessions', 'conversation']

export function apply(ctx) {
  ctx.effect(() => {
    const node = document.createElement('style')
    node.textContent = styles
    document.head.appendChild(node)
    return () => node.remove()
  }, 'dsh-review: styles')

  const register = (name, options, component) =>
    ctx.slots.inject(name, () => ctx.slots.register({ name, ...options }, component))
  register('settings.section', { id: 'dsh-review', order: 65, label: () => '回答审查' }, Settings)
  register('settings.section.icon', { id: 'dsh-review' }, ReviewIcon)
  const addDraft = (sessionId, turnId) => prepareFollowup(ctx, sessionId, turnId)
  const props = () => ({ addDraft })
  register('conversation.input.left', { id: 'dsh-review', order: 55, inject: props }, ComposerReview)
  register('conversation.chat.turnTail', { id: 'dsh-review', order: 65, inject: props }, TurnReview)
}
