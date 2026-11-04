import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth } from "../lib/auth";
import { z } from "zod";

const router: IRouter = Router();

router.post("/ai/rewrite", requireAuth, async (req, res): Promise<void> => {
  const schema = z.object({
    text: z.string().min(1).max(4000),
    context: z.string().max(200).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { text, context } = parsed.data;

  const isMeetingContext = !context || context.toLowerCase().includes("meeting") || context.toLowerCase().includes("note") || context.toLowerCase().includes("caption");
  const contextHint = context ? ` Context: ${context}.` : "";

  const systemPrompt = isMeetingContext
    ? `You are an expert meeting notes editor and professional writing assistant.${contextHint}
Your task is to rewrite the given meeting note, caption, or action item into the best possible version.

Apply ALL of the following improvements:
- Fix grammar, punctuation, spelling, and capitalization
- Remove filler words, redundancy, and vague language (e.g. "sort of", "kind of", "basically", "you know")
- Use active voice and strong, precise verbs
- Make action items start with a clear verb and owner if mentioned (e.g. "John to send the report by Friday")
- Make decisions definitive and clear (e.g. "We decided to…" → "Decided: …")
- Make highlights impactful and memorable
- Ensure every word earns its place — be concise but never omit important details
- Preserve all names, dates, numbers, and specific facts exactly as given
- Match professional business communication tone

Return ONLY the rewritten text — no preamble, no labels, no quotation marks.`
    : `You are a professional writing assistant.${contextHint}
Rewrite the following text to be clear, professional, and concise:
- Fix grammar, punctuation, spelling, and capitalization
- Remove filler words and redundancy
- Use active voice
- Keep all key facts and meaning intact
Return ONLY the rewritten text with no explanation.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 600,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text.trim() },
    ],
  });

  const rewritten = completion.choices[0]?.message?.content?.trim() ?? text.trim();
  res.json({ rewritten });
});

router.post("/ai/correct", requireAuth, async (req, res): Promise<void> => {
  const schema = z.object({
    text: z.string().min(1).max(2000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { text } = parsed.data;

  const completion = await openai.chat.completions.create({
    model: "gpt-5-nano",
    max_completion_tokens: 500,
    messages: [
      {
        role: "system",
        content: `You are a grammar and spelling corrector.
Fix any grammar, spelling, or punctuation errors in the user's text.
Keep the original wording, style, and meaning as close as possible.
Do NOT rephrase or rewrite — only correct errors.
Return ONLY the corrected text with no explanation or preamble.`,
      },
      { role: "user", content: text.trim() },
    ],
  });

  const corrected = completion.choices[0]?.message?.content?.trim() ?? text.trim();
  res.json({ corrected });
});

router.post("/ai/meeting-summary", requireAuth, async (req, res): Promise<void> => {
  const schema = z.object({
    transcript: z.string().min(1).max(60000),
    meetingTitle: z.string().max(200).optional(),
    participants: z.array(z.string().max(100)).max(100).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { transcript, meetingTitle, participants } = parsed.data;

  const participantLine = participants && participants.length > 0
    ? `\nParticipants: ${participants.join(", ")}`
    : "";
  const titleLine = meetingTitle ? `\nMeeting Title: ${meetingTitle}` : "";

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert meeting analyst and executive assistant.
Analyse the following meeting transcript and return a JSON object with EXACTLY this structure:
{
  "summary": "2-3 sentence executive summary of the meeting",
  "topics": ["topic discussed", "another topic", ...],
  "decisions": ["decision made", ...],
  "actionItems": [{"owner": "person name or 'Team'", "task": "what needs to be done"}, ...],
  "openQuestions": ["unanswered question", ...],
  "attendance": ["speaker name", ...],
  "tasks": [{"title": "clear task title", "owner": "person name or 'Team'", "priority": "high|medium|low"}, ...],
  "risks": [{"description": "risk or concern identified", "severity": "high|medium|low"}, ...],
  "defects": [{"description": "bug, issue or defect discussed", "severity": "high|medium|low"}, ...]
}
Rules:
- summary: concise, specific, professional
- topics: extract 3-8 main subjects discussed
- decisions: only clear, confirmed decisions (not suggestions)
- actionItems: concrete tasks with a clear owner; use "Team" if no specific owner
- openQuestions: things discussed but not resolved
- attendance: unique speaker names found in the transcript
- tasks: actionable work items (similar to actionItems but more granular, with priority); extract all distinct tasks
- risks: anything identified as a risk, concern, blocker, or uncertainty; severity = high if urgent/critical
- defects: bugs, issues, defects, or failures explicitly mentioned; severity based on impact described
- Return valid JSON only — no prose outside the object`,
      },
      {
        role: "user",
        content: `${titleLine}${participantLine}\n\nTranscript:\n${transcript.trim()}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  try {
    const parsed2 = JSON.parse(raw) as {
      summary?: string;
      topics?: string[];
      decisions?: string[];
      actionItems?: { owner: string; task: string }[];
      openQuestions?: string[];
      attendance?: string[];
      tasks?: { title: string; owner: string; priority: string }[];
      risks?: { description: string; severity: string }[];
      defects?: { description: string; severity: string }[];
    };
    res.json({
      summary: parsed2.summary ?? "",
      topics: parsed2.topics ?? [],
      decisions: parsed2.decisions ?? [],
      actionItems: parsed2.actionItems ?? [],
      openQuestions: parsed2.openQuestions ?? [],
      attendance: parsed2.attendance ?? [],
      tasks: parsed2.tasks ?? [],
      risks: parsed2.risks ?? [],
      defects: parsed2.defects ?? [],
    });
  } catch {
    res.status(500).json({ error: "AI returned malformed JSON" });
  }
});

export default router;
