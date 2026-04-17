import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { AutomacAI } from '../ai/copilotClient';
import { DiagnosticShell } from './diagnosticShell';

export function createPanel(
  context: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'automacfree.helpdesk',
    'Automac Free',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'src', 'webview')],
      retainContextWhenHidden: true,
    }
  );

  void setupWebview(panel, context, statusBarItem);
  return panel;
}

async function setupWebview(
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem
): Promise<void> {
  const nonce = crypto.randomBytes(32).toString('hex');
  const base = vscode.Uri.joinPath(context.extensionUri, 'src', 'webview');
  const styleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(base, 'home.css'));
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(base, 'home.js'));

  const htmlUri = vscode.Uri.joinPath(base, 'home.html');
  const htmlBytes = await vscode.workspace.fs.readFile(htmlUri);
  let html = new TextDecoder('utf-8').decode(htmlBytes);

  const devMode = vscode.workspace
    .getConfiguration('automacfree')
    .get<boolean>('devMode', false);

  html = html
    .replaceAll('{{CSP_SOURCE}}', panel.webview.cspSource)
    .replaceAll('{{NONCE}}', nonce)
    .replaceAll('{{STYLE_URI}}', styleUri.toString())
    .replaceAll('{{SCRIPT_URI}}', scriptUri.toString())
    .replaceAll('{{DEV_MODE}}', devMode ? 'true' : 'false');

  panel.webview.html = html;

  const postMsg = (msg: unknown) => {
    void panel.webview.postMessage(msg);
  };

  const ai = new AutomacAI();
  const shell = new DiagnosticShell(ai, postMsg, statusBarItem);

  panel.webview.onDidReceiveMessage(async (message: { type?: string; card?: string; text?: string }) => {
    switch (message.type) {
      case 'ready':
        break;
      case 'startDiagnosis':
        if (typeof message.card === 'string') {
          await shell.diagnose(message.card);
        }
        break;
      case 'chatMessage':
        if (typeof message.text === 'string') {
          await shell.handleUserMessage(message.text);
        }
        break;
      default:
        break;
    }
  });
}
