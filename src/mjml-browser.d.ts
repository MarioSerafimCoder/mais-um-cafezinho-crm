declare module 'mjml-browser' {
  export default function mjml(input: string, options?: Record<string, unknown>): { html: string; errors: Array<{ message: string; formattedMessage?: string }> }
}
