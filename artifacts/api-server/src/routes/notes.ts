import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, meetingNotesTable, meetingSummariesTable, meetingsTable } from "@workspace/db";
import {
  CreateMeetingNoteBody,
  UpdateMeetingNoteBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

function toNoteResponse(note: any) {
  return {
    ...note,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function toSummaryResponse(s: any) {
  return {
    ...s,
    actionItems: JSON.parse(s.actionItems ?? "[]"),
    keyPoints: JSON.parse(s.keyPoints ?? "[]"),
    decisions: JSON.parse(s.decisions ?? "[]"),
    generatedAt: s.generatedAt.toISOString(),
  };
}

function parsedId(val: string | string[]): number {
  return parseInt(String(val), 10);
}

// List notes for a meeting
router.get("/meetings/:id/notes", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const meetingId = parsedId(req.params.id);
  if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting id" }); return; }

  const meeting = await db.select().from(meetingsTable).where(eq(meetingsTable.id, meetingId)).limit(1);
  if (!meeting[0]) { res.status(404).json({ error: "Meeting not found" }); return; }
  void userId;

  const notes = await db
    .select()
    .from(meetingNotesTable)
    .where(eq(meetingNotesTable.meetingId, meetingId))
    .orderBy(asc(meetingNotesTable.createdAt));

  res.json(notes.map(toNoteResponse));
});

// Create a note
router.post("/meetings/:id/notes", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const meetingId = parsedId(req.params.id);
  if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting id" }); return; }

  const body = CreateMeetingNoteBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const meeting = await db.select().from(meetingsTable).where(eq(meetingsTable.id, meetingId)).limit(1);
  if (!meeting[0]) { res.status(404).json({ error: "Meeting not found" }); return; }

  const authorName = meeting[0].hostClerkId === userId ? meeting[0].hostName : "Participant";

  const [note] = await db.insert(meetingNotesTable).values({
    meetingId,
    authorClerkId: userId,
    authorName,
    content: body.data.content,
    noteType: body.data.noteType ?? "note",
  }).returning();

  res.status(201).json(toNoteResponse(note));
});

// Export notes as Markdown
router.get("/meetings/:id/notes/export", requireAuth, async (req, res): Promise<void> => {
  const meetingId = parsedId(req.params.id);
  if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting id" }); return; }

  const meeting = await db.select().from(meetingsTable).where(eq(meetingsTable.id, meetingId)).limit(1);
  if (!meeting[0]) { res.status(404).json({ error: "Meeting not found" }); return; }

  const notes = await db
    .select()
    .from(meetingNotesTable)
    .where(eq(meetingNotesTable.meetingId, meetingId))
    .orderBy(asc(meetingNotesTable.createdAt));

  const summary = await db
    .select()
    .from(meetingSummariesTable)
    .where(eq(meetingSummariesTable.meetingId, meetingId))
    .limit(1);

  const typeLabel: Record<string, string> = {
    note: "📝 Note",
    action: "✅ Action Item",
    decision: "🔵 Decision",
    highlight: "⭐ Highlight",
  };

  const date = meeting[0].startedAt ?? meeting[0].createdAt;
  let md = `# Meeting Notes: ${meeting[0].title}\n`;
  md += `**Date:** ${date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}\n`;
  md += `**Host:** ${meeting[0].hostName}\n\n`;

  if (summary[0]) {
    md += `## AI Summary\n${summary[0].summary}\n\n`;
    const kp: string[] = JSON.parse(summary[0].keyPoints);
    if (kp.length) { md += `### Key Points\n${kp.map(p => `- ${p}`).join("\n")}\n\n`; }
    const ai: string[] = JSON.parse(summary[0].actionItems);
    if (ai.length) { md += `### Action Items\n${ai.map(p => `- ${p}`).join("\n")}\n\n`; }
    const dec: string[] = JSON.parse(summary[0].decisions);
    if (dec.length) { md += `### Decisions\n${dec.map(p => `- ${p}`).join("\n")}\n\n`; }
  }

  const byType: Record<string, typeof notes> = {};
  for (const note of notes) {
    if (!byType[note.noteType]) byType[note.noteType] = [];
    byType[note.noteType].push(note);
  }

  for (const type of ["highlight", "decision", "action", "note"]) {
    const group = byType[type];
    if (!group?.length) continue;
    md += `## ${typeLabel[type] ?? type}\n`;
    for (const n of group) {
      md += `- ${n.content}  *(${n.authorName})*\n`;
    }
    md += "\n";
  }

  res.json({ markdown: md });
});

// Update a note
router.put("/meetings/:id/notes/:noteId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const meetingId = parsedId(req.params.id);
  const noteId = parsedId(req.params.noteId);
  if (isNaN(meetingId) || isNaN(noteId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = UpdateMeetingNoteBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const existing = await db
    .select()
    .from(meetingNotesTable)
    .where(and(eq(meetingNotesTable.id, noteId), eq(meetingNotesTable.meetingId, meetingId)))
    .limit(1);

  if (!existing[0]) { res.status(404).json({ error: "Note not found" }); return; }
  if (existing[0].authorClerkId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const updates: Record<string, unknown> = {};
  if (body.data.content !== undefined) updates.content = body.data.content;
  if (body.data.noteType !== undefined) updates.noteType = body.data.noteType;

  const [updated] = await db
    .update(meetingNotesTable)
    .set(updates)
    .where(eq(meetingNotesTable.id, noteId))
    .returning();

  res.json(toNoteResponse(updated));
});

// Delete a note
router.delete("/meetings/:id/notes/:noteId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const meetingId = parsedId(req.params.id);
  const noteId = parsedId(req.params.noteId);
  if (isNaN(meetingId) || isNaN(noteId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const existing = await db
    .select()
    .from(meetingNotesTable)
    .where(and(eq(meetingNotesTable.id, noteId), eq(meetingNotesTable.meetingId, meetingId)))
    .limit(1);

  if (!existing[0]) { res.status(404).json({ error: "Note not found" }); return; }

  const meeting = await db.select().from(meetingsTable).where(eq(meetingsTable.id, meetingId)).limit(1);
  const isHostUser = meeting[0]?.hostClerkId === userId;
  if (existing[0].authorClerkId !== userId && !isHostUser) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  await db.delete(meetingNotesTable).where(eq(meetingNotesTable.id, noteId));
  res.json({ ok: true });
});

// Polish dictated text with AI
router.post("/notes/polish", requireAuth, async (req, res): Promise<void> => {
  const { content, noteType } = req.body as { content?: string; noteType?: string };
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content is required" }); return;
  }

  const typeDescriptions: Record<string, string> = {
    note: "a general meeting note",
    action: "an action item (task that needs to be done, ideally starting with a verb)",
    decision: "a decision that was made in the meeting",
    highlight: "a key highlight or important moment from the meeting",
  };
  const typeHint = typeDescriptions[noteType ?? "note"] ?? "a meeting note";

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 500,
    messages: [
      {
        role: "system",
        content: `You are a professional meeting assistant. The user has dictated ${typeHint} using voice. 
Clean up and polish the dictated text:
- Fix grammar and punctuation
- Remove filler words (um, uh, like, you know, etc.)
- Fix capitalization
- Make it concise and professional
- Preserve the original meaning and all details
- Return ONLY the polished text, no explanations or preamble`,
      },
      {
        role: "user",
        content: content.trim(),
      },
    ],
  });

  const polished = completion.choices[0]?.message?.content?.trim() ?? content.trim();
  res.json({ polished });
});

// Get AI summary
router.get("/meetings/:id/summary", requireAuth, async (req, res): Promise<void> => {
  const meetingId = parsedId(req.params.id);
  if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting id" }); return; }

  const summary = await db
    .select()
    .from(meetingSummariesTable)
    .where(eq(meetingSummariesTable.meetingId, meetingId))
    .limit(1);

  if (!summary[0]) { res.status(404).json({ error: "No summary yet" }); return; }
  res.json(toSummaryResponse(summary[0]));
});

// Generate AI summary from notes
router.post("/meetings/:id/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const meetingId = parsedId(req.params.id);
  if (isNaN(meetingId)) { res.status(400).json({ error: "Invalid meeting id" }); return; }

  const meeting = await db.select().from(meetingsTable).where(eq(meetingsTable.id, meetingId)).limit(1);
  if (!meeting[0]) { res.status(404).json({ error: "Meeting not found" }); return; }
  if (meeting[0].hostClerkId !== userId) { res.status(403).json({ error: "Only host can generate summary" }); return; }

  const notes = await db
    .select()
    .from(meetingNotesTable)
    .where(eq(meetingNotesTable.meetingId, meetingId))
    .orderBy(asc(meetingNotesTable.createdAt));

  if (!notes.length) { res.status(400).json({ error: "No notes to summarize" }); return; }

  const notesText = notes
    .map(n => `[${n.noteType.toUpperCase()}] ${n.content}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 1024,
    messages: [
      {
        role: "system",
        content: `You are a professional meeting assistant. Analyze meeting notes and produce a concise, structured summary.
Respond with a JSON object with these fields:
- summary: string (2-4 sentence executive summary of the meeting)
- keyPoints: string[] (up to 6 most important discussion points)
- actionItems: string[] (concrete tasks/assignments identified, starting with an owner name if mentioned)
- decisions: string[] (key decisions that were made)

Be concise and actionable. Do not invent information not present in the notes.`,
      },
      {
        role: "user",
        content: `Meeting: "${meeting[0].title}"\nHost: ${meeting[0].hostName}\n\nNotes:\n${notesText}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { summary?: string; keyPoints?: string[]; actionItems?: string[]; decisions?: string[] } = {};
  try { parsed = JSON.parse(raw); } catch { /* fallback */ }

  const summaryText = parsed.summary ?? "Summary could not be generated.";
  const keyPoints = JSON.stringify(parsed.keyPoints ?? []);
  const actionItems = JSON.stringify(parsed.actionItems ?? []);
  const decisions = JSON.stringify(parsed.decisions ?? []);

  const existing = await db
    .select()
    .from(meetingSummariesTable)
    .where(eq(meetingSummariesTable.meetingId, meetingId))
    .limit(1);

  let result;
  if (existing[0]) {
    [result] = await db
      .update(meetingSummariesTable)
      .set({ summary: summaryText, keyPoints, actionItems, decisions, generatedAt: new Date() })
      .where(eq(meetingSummariesTable.meetingId, meetingId))
      .returning();
  } else {
    [result] = await db
      .insert(meetingSummariesTable)
      .values({ meetingId, summary: summaryText, keyPoints, actionItems, decisions })
      .returning();
  }

  res.json(toSummaryResponse(result));
});

export default router;
