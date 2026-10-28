import { useState } from 'react'

export function DeliveryPreparation() {
  const [recipient, setRecipient] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [prepared, setPrepared] = useState(false)
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())
  return <details className="inspector-section"><summary>Homologação por e-mail</summary>
    <p>Preparação local. Nenhum envio está habilitado. A autorização deste destinatário ainda precisará ser configurada no servidor.</p>
    <label>Destinatário de teste<input type="email" value={recipient} onChange={e => { setRecipient(e.target.value); setConfirmed(false); setPrepared(false) }} /></label>
    <p>Destino: <strong>{recipient.trim() || 'Não informado'}</strong></p>
    <label><input type="checkbox" style={{ width: 'auto', minHeight: 0, marginRight: 8 }} checked={confirmed} onChange={e => { setConfirmed(e.target.checked); setPrepared(false) }} />Confirmo que este destinatário autorizou receber testes.</label>
    <button disabled={!valid || !confirmed} onClick={() => setPrepared(true)}>Preparar teste sem enviar</button>
    {prepared && <p role="status">Destinatário conferido: {recipient.trim()}. Nenhuma solicitação de envio foi feita. Faltam allowlist no servidor, permissão e confirmação final por envio.</p>}
  </details>
}
