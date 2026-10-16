import { NextResponse } from 'next/server';

const EXPAND_PROMPT = `You are the "Expanding Round Table" reasoning assistant for THE LAST 10%.

Task: Given the current investigation state (provided as JSON in the request body under 'insight'), perform a prioritized cross-disciplinary expansion to find additional useful knowledge.

Follow these rules strictly:
1) First, identify what remains unanswered or uncertain in the current insight. Return those as an array under "unknowns".
2) Prioritize up to 3 additional fields (disciplines) most likely to contribute relevant knowledge. For each field, explain in one sentence why it could help and what it typically understands about similar problems.
3) For each chosen field, suggest specific knowledge, models, or metaphors it can bring. Represent these as additional "perspectives" and map how they relate to existing perspectives.
4) For each new connection, list one or two concrete, testable checks (data sources, simple experiments, simulations, or calculations) that could confirm or falsify the connection.
5) Merge results with the existing insight: add perspectives, missingQuestions, predictions, and visual nodes/edges (keep IDs consistent where possible).
6) If a proposed connection fails a basic consistency check or lacks necessary data, mark it as "ruledOut" with a short reason.
7) Stop expanding when additional fields are unlikely to add useful, testable information.

Output: Respond with a brief plain-language summary followed by a JSON block (```json ... ```). The JSON must follow this schema (omit empty fields):
{
  "title": "",
  "text": "",
  "visual": {"type":"network","nodes":[{"id":"","label":"","group":""}],"edges":[{"from":"","to":"","label":""}]},
  "perspectives":[{"id":"","label":"","notes":"","field":""}],
  "missingQuestions":["..."],
  "predictions":[{"label":"","summary":"","when":""}],
  "unknowns":["..."],
  "ruledOut":["..."],
  "contributingFields":["Field A","Field B"]
}

Be careful not to invent data. If you propose a test that requires external data or code, mark it as 'needsData'. Use everyday language. Keep the JSON parseable.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const insight = body.insight || {};
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!apiKey) return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 500 });

    const messages = [
      { role: 'system', content: EXPAND_PROMPT },
      { role: 'user', content: `Current insight JSON:\n${JSON.stringify(insight, null, 2)}\n\nFollow the expansion rules.` }
    ];

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, max_tokens: 1200, temperature: 0.55 })
    });

    const data = await resp.json();
    const assistant = data.choices?.[0]?.message?.content || '';

    // extract JSON block
    const jsonMatch = assistant.match(/```json([\s\S]*?)```/i);
    let structured = null;
    if (jsonMatch) {
      try {
        structured = JSON.parse(jsonMatch[1]);
      } catch (e) {
        const braceMatch = assistant.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          try { structured = JSON.parse(braceMatch[0]); } catch {};
        }
      }
    }

    return NextResponse.json({ text: assistant.replace(/```json([\s\S]*?)```/i, '').trim(), structured });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
