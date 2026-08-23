import GameRoom from "@/components/game-room"

export default async function GamePage({ params, searchParams }: { params: Promise<{ gameId: string }>; searchParams: Promise<{ code?: string }> }) {
  const [{ gameId }, { code }] = await Promise.all([params, searchParams])
  const joinCode = typeof code === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : undefined
  return <GameRoom gameId={gameId} joinCode={joinCode} />
}
