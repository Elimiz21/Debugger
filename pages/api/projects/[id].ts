import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = parseInt(req.query.id as string, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: "Invalid project id" });

  const token = (req.headers.authorization || "").split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Unauthorized" });
  const userId = user.id;

  if (req.method === "GET") {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          sessions: {
            include: {
              messages: { orderBy: { id: "asc" } }
            }
          }
        }
      });
      if (!project || project.userId !== userId) {
        return res.status(404).json({ error: "Not found or access denied" });
      }
      // Remove sensitive keys
      const { supabaseKey, vercelKey, otherApiKeys, ...safe } = project;
      return res.status(200).json({ project: safe });
    } catch {
      return res.status(500).json({ error: "Failed to fetch project" });
    }
  }

  res.setHeader("Allow", "GET");
  res.status(405).end("Method Not Allowed");
}
