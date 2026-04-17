import * as vscode from 'vscode';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiResponse {
  text: string;
  model: string;
}

export class AutomacAI {
  async chat(
    messages: AiMessage[],
    systemPrompt: string,
    token?: vscode.CancellationToken
  ): Promise<AiResponse> {
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (models.length === 0) {
      throw new Error('No Copilot model available. Check your GitHub Copilot subscription.');
    }
    const fam = (f: string) => f.toLowerCase();
    const sonnet = models.find((m) => fam(m.family).includes('claude') && fam(m.family).includes('sonnet'));
    const gpt4o = models.find(
      (m) => fam(m.family).includes('gpt-4o') || fam(m.family).includes('gpt4o')
    );
    const model = sonnet ?? gpt4o ?? models[0];

    const lmMessages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      ...messages.map((m) =>
        m.role === 'user'
          ? vscode.LanguageModelChatMessage.User(m.content)
          : vscode.LanguageModelChatMessage.Assistant(m.content)
      ),
    ];

    const response = await model.sendRequest(lmMessages, {}, token);
    let text = '';
    for await (const fragment of response.text) {
      text += fragment;
    }
    return { text, model: model.family };
  }
}
