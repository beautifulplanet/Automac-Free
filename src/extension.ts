import * as vscode from 'vscode';
import { createPanel } from './webview/provider';

let currentPanel: vscode.WebviewPanel | undefined;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBarItem.command = 'automacfree.openHelpdesk';
  statusBarItem.text = '$(tools) Automac: Ready';
  statusBarItem.tooltip = 'Open Automac Free Diagnostics';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const openPanel = () => {
    if (currentPanel) {
      currentPanel.reveal(vscode.ViewColumn.One);
      return;
    }
    currentPanel = createPanel(context, statusBarItem);
    currentPanel.onDidDispose(() => {
      currentPanel = undefined;
      statusBarItem.text = '$(tools) Automac: Ready';
    }, null, context.subscriptions);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('automacfree.openHelpdesk', openPanel)
  );

  // Sidebar launcher view — opens the main helpdesk when the sidebar icon is clicked
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('automacfree.launcher', {
      resolveWebviewView(view: vscode.WebviewView) {
        view.webview.html = '<html><body style="padding:12px;font-family:var(--vscode-font-family);color:var(--vscode-foreground)"><p>Click here or use the status bar to open Automac Free diagnostics.</p></body></html>';
        // When the sidebar view becomes visible, open the main helpdesk panel
        view.onDidChangeVisibility(() => {
          if (view.visible) { openPanel(); }
        });
        // Also open immediately on first resolve
        openPanel();
      }
    })
  );

  // Auto-open on startup if setting is enabled
  const config = vscode.workspace.getConfiguration('automacfree');
  if (config.get('openOnStartup', true)) {
    openPanel();
  }
}

export function deactivate(): void {}
