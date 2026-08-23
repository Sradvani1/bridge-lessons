"use client"

import { QRCodeSVG } from "qrcode.react"

export default function GameJoinQr({ gameId }: { gameId: string }) {
  const joinUrl = `${window.location.origin}/play/${gameId}`

  return <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
    <QRCodeSVG value={joinUrl} size={180} level="M" includeMargin className="rounded-lg bg-white p-2" />
    <div className="text-center sm:text-left"><h2 className="text-xl font-bold text-[#123a28]">Table Join QR Code</h2><p className="mt-1 max-w-sm text-[#52615a]">Have each scorekeeper scan this with their phone camera. It opens this game directly, ready to choose an available table.</p></div>
  </div>
}
