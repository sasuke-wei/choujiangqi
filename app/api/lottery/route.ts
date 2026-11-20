import { env } from "cloudflare:workers";
import { lottery } from "@/lib/lottery.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return lottery(request, env.DB); }
export async function POST(request: Request) { return lottery(request, env.DB); }
