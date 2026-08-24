import http from "k6/http"
import { check, sleep } from "k6"

const baseUrl = (__ENV.BASE_URL || "https://bridge-lessons.vercel.app").replace(/\/$/, "")

export const options = {
  scenarios: {
    classBrowsers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 5 },
        { duration: "20s", target: 15 },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
}

export default function browseGameLobby() {
  const responses = http.batch([
    ["GET", `${baseUrl}/`],
    ["GET", `${baseUrl}/play`],
  ])

  check(responses[0], {
    "homepage returns 200": (response) => response.status === 200,
    "homepage includes lesson content": (response) => response.body.includes("Bridge with Vimal"),
  })
  check(responses[1], {
    "lobby returns 200": (response) => response.status === 200,
    "lobby renders": (response) => response.body.includes("Game"),
  })

  sleep(1)
}
