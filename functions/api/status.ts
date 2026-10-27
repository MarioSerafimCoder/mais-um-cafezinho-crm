import { json } from '../_utils'

export const onRequestGet = ({ env }: { env: { BUTTONDOWN_API_KEY?: string } }) => json({
  configured: Boolean(env.BUTTONDOWN_API_KEY?.trim()),
  demo: !env.BUTTONDOWN_API_KEY?.trim(),
})
