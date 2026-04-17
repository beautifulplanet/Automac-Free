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

  // Auto-open on startup if setting is enabled
  const config = vscode.workspace.getConfiguration('automacfree');
  if (config.get('openOnStartup', true)) {
    openPanel();
  }
}

export function deactivate(): void {}
