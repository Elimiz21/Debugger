import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Configuration, OpenAIApi } from "openai";

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY
}));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const { sessionId, content } = req.body;
  if (!sessionId || !content) return res.status(400).json({ error: "Missing data" });

  const token = (req.headers.authorization || "").split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Unauthorized" });
  const userId = user.id;

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { project: true }
    });
    if (!session || session.project.userId !== userId) {
      return res.status(404).json({ error: "Session not found or access denied" });
    }

    // Save user message
    await prisma.message.create({
      data: { sessionId, role: "user", content }
    });

    // Fetch entire conversation
    const all = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { id: "asc" }
    });

    // Build system prompt
    const { repoUrl, appUrl, supabaseKey, vercelKey, otherApiKeys } = session.project;
    let sys = "You are an AI assistant helping debug a web app.\n";
    sys += `Repo URL: ${repoUrl}\nApp URL: ${appUrl || "N/A"}\n`;
    if (supabaseKey) sys += "Supabase key provided.\n";
    if (vercelKey) sys += "Vercel key provided.\n";
    if (otherApiKeys) sys += "Other API keys provided.\n";
    sys += "Continue the debugging conversation.";

    const messages = [
      { role: "system", content: sys },
      ...all.map(m => ({ role: m.role, content: m.content }))
    ];

    const completion = await openai.createChatCompletion({
      model: "gpt-4",
      messages
    });

    const ai = completion.data.choices[0].message?.content || "";

    await prisma.message.create({
      data: { sessionId, role: "assistant", content: ai }
    });

    return res.status(200).json({ assistantMessage: ai });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to process message" });
  }
}
