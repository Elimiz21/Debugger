import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Configuration, OpenAIApi } from "openai";

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY
}));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Unauthorized" });
  const userId = user.id;

  if (req.method === "GET") {
    try {
      const projects = await prisma.project.findMany({
        where: { userId },
        select: { id: true, repoUrl: true, bugDescription: true, createdAt: true },
        orderBy: { createdAt: "desc" }
      });
      return res.status(200).json({ projects });
    } catch {
      return res.status(500).json({ error: "Failed to fetch projects" });
    }
  }

  if (req.method === "POST") {
    const { repoUrl, appUrl, supabaseKey, vercelKey, otherApiKeys, bugDescription } = req.body;
    if (!repoUrl || !bugDescription) return res.status(400).json({ error: "Missing fields" });

    try {
      const project = await prisma.project.create({
        data: { userId, repoUrl, appUrl, supabaseKey, vercelKey, otherApiKeys, bugDescription }
      });
      const session = await prisma.session.create({ data: { projectId: project.id } });
      await prisma.message.create({
        data: { sessionId: session.id, role: "user", content: bugDescription }
      });

      let systemPrompt = "You are an AI assistant helping to debug a web application.\n";
      systemPrompt += `Repository URL: ${repoUrl}\n`;
      systemPrompt += `App URL: ${appUrl || "N/A"}\n`;
      if (supabaseKey) systemPrompt += "A Supabase key was provided.\n";
      if (vercelKey) systemPrompt += "A Vercel key was provided.\n";
      if (otherApiKeys) systemPrompt += "Other API keys were provided.\n";
      systemPrompt += "Analyze the bug description and suggest fixes.";

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: bugDescription }
      ];

      const completion = await openai.createChatCompletion({
        model: "gpt-4",
        messages
      });
      const aiReply = completion.data.choices[0].message?.content || "";
      await prisma.message.create({
        data: { sessionId: session.id, role: "assistant", content: aiReply }
      });

      return res.status(200).json({ projectId: project.id, sessionId: session.id });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to create project" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).end("Method Not Allowed");
}
