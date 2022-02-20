import * as vscode from "vscode";
import {
  addFile,
  createProfile,
  executeRefreshTree,
  openFile,
  refreshTreeCommandName,
  switchProfile,
} from "./commands";
import { ProfileManager } from "./profile";
import { FileTreeProvider } from "./tree";

export async function activate(context: vscode.ExtensionContext) {
  const profileManager = new ProfileManager(context.workspaceState);
  await profileManager.initialize();

  const fileTreeProvider = new FileTreeProvider(profileManager);
  const fileTreeView = vscode.window.createTreeView("eda", {
    treeDataProvider: fileTreeProvider,
  });

  context.subscriptions.push(
    fileTreeView,
    vscode.commands.registerCommand("eda.addFile", addFile(profileManager)),
    vscode.commands.registerCommand("eda.openFile", openFile(profileManager)),
    vscode.commands.registerCommand(refreshTreeCommandName, () =>
      fileTreeProvider.refresh()
    ),
    vscode.commands.registerCommand(
      "eda.createProfile",
      createProfile(profileManager)
    ),
    vscode.commands.registerCommand(
      "eda.switchProfile",
      switchProfile(profileManager)
    )
  );

  vscode.workspace.onDidChangeConfiguration((e) => {
    executeRefreshTree();
  });
  vscode.workspace.onDidCreateFiles((e) => {
    executeRefreshTree();
  });
  vscode.workspace.onDidDeleteFiles((e) => {
    executeRefreshTree();
  });
  vscode.workspace.onDidRenameFiles((e) => {
    executeRefreshTree();
  });
  vscode.workspace.onDidChangeConfiguration((e) => {
    executeRefreshTree();
  });
}

// this method is called when your extension is deactivated
export function deactivate() {}
