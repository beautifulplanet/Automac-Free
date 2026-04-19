import * as vscode from 'vscode';
import { AutomacAI } from '../ai/copilotClient';
import type { AiMessage } from '../ai/copilotClient';
import { executeTool, type ToolCall, TOOL_DESCRIPTIONS } from '../ai/tools';
import { scrubPII } from '../ai/scrubber';

const MAX_TOOL_LOOPS = 8;

const SYSTEM_PROMPT =
  `You are Automac Free, a free PC diagnostic assistant running inside VS Code on the user's Windows PC.

You have LIVE access to 13 read-only diagnostic tools. These tools run real PowerShell commands on the user's machine and return real data. You are NOT simulating anything. The tools work RIGHT NOW.

HOW TO CALL A TOOL:
To call a tool, respond with EXACTLY this format on its own line:
TOOL_CALL: tool_name()
or with parameters:
TOOL_CALL: tool_name(param1=value1, param2=value2)

The system will execute the tool and return the real output to you. You can then call another tool or give your analysis.

CRITICAL RULES:
- You MUST use TOOL_CALL to run tools. Do NOT pretend to run them.
- Call ONE tool at a time. Wait for results before calling the next.
- Do NOT list tools with checkmarks — actually call them one by one.
- Do NOT say you lack access. You HAVE live access to this PC.
- NEVER fabricate system information. Only report what tools return.
- After gathering data, explain findings in plain language with specific numbers.
- If something is risky, warn with ⚠️ BEFORE suggesting manual action.
- For automated fixes, mention that Automac IT (the full version) can take action.

EXAMPLE INTERACTION:
User: My computer is slow
You respond: Let me check your system. Starting with overall system info.
TOOL_CALL: system_info()
[System returns real data, you analyze it, then call more tools as needed]

TOOLS:
` + TOOL_DESCRIPTIONS;

/** Parse a line like: TOOL_CALL: tool_name(param1=value1, param2=value2) */
function parseToolCall(response: string): ToolCall | null {
  const m = response.match(/TOOL_CALL:\s*([a-z][a-z0-9_]*)\s*\(([^)]*)\)/i);
  if (!m) {
    return null;
  }
  const tool = m[1];
  const inner = m[2].trim();
  const params: Record<string, string> = {};
  if (inner.length > 0) {
    for (const part of inner.split(/\s*,\s*/)) {
      const eq = part.indexOf('=');
      if (eq <= 0) {
        continue;
      }
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (key) {
        params[key] = value;
      }
    }
  }
  return { tool, params };
}

export class DiagnosticShell {
  private messages: AiMessage[] = [];
  private toolCallCount = 0;

  constructor(
    private readonly ai: AutomacAI,
    private readonly postMessage: (msg: unknown) => void,
    private readonly statusBarItem: vscode.StatusBarItem
  ) {}

  async diagnose(card: string): Promise<void> {
    this.postMessage({ type: 'showChat', card });
    this.messages = [{ role: 'user', content: `I need help with: ${card}` }];
    this.toolCallCount = 0;
    await this.runToolLoop();
  }

  async handleUserMessage(text: string): Promise<void> {
    this.messages.push({ role: 'user', content: text });
    this.toolCallCount = 0;
    await this.runToolLoop();
  }

  private async runToolLoop(): Promise<void> {
    const shouldScrub = vscode.workspace
      .getConfiguration('automacfree')
      .get<boolean>('privacy.scrubToolOutput', true);

    this.statusBarItem.text = '$(sync~spin) Automac: Diagnosing...';
    this.postMessage({ type: 'thinking', active: true });

    for (;;) {
      let responseText: string;
      try {
        const res = await this.ai.chat(this.messages, SYSTEM_PROMPT);
        responseText = res.text;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.postMessage({ type: 'thinking', active: false });
        this.postMessage({ type: 'assistantMessage', text: message });
        this.postMessage({ type: 'diagnosisComplete' });
        this.statusBarItem.text = '$(tools) Automac: Ready';
        return;
      }

      const call = parseToolCall(responseText);
      if (call && this.toolCallCount < MAX_TOOL_LOOPS) {
        this.statusBarItem.text = '$(gear~spin) Running: ' + call.tool;
        this.postMessage({ type: 'toolRunning', tool: call.tool });
        const toolResult = await executeTool(call);
        const scrubbed = shouldScrub ? scrubPII(toolResult.output) : toolResult.output;
        this.postMessage({ type: 'toolResult', tool: call.tool, output: scrubbed });
        this.messages.push({ role: 'assistant', content: responseText });
        this.messages.push({
          role: 'user',
          content: `Tool ${call.tool} result:\n${scrubbed}`,
        });
        this.toolCallCount++;
        this.statusBarItem.text = '$(sync~spin) Automac: Analyzing...';
        continue;
      }

      this.postMessage({ type: 'thinking', active: false });
      this.postMessage({ type: 'assistantMessage', text: responseText });
      this.postMessage({ type: 'diagnosisComplete' });
      this.statusBarItem.text = '$(tools) Automac: Ready';
      return;
    }
  }
}
